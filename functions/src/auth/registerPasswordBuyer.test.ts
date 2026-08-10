import { describe, it, expect, beforeEach } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { adminAuth, adminDb } from '../lib/admin.js';
import { registerPasswordBuyerHandler } from './registerPasswordBuyer.js';

function asPasswordUser(
  uid: string,
  data: Record<string, unknown> = { firstName: 'Ana', lastName: 'Gomez' },
  email = 'ana@example.com',
): CallableRequest {
  return {
    auth: {
      uid,
      token: {
        email,
        email_verified: true,
        firebase: { sign_in_provider: 'password', identities: {} },
      } as never,
    },
    rawRequest: {} as never,
    data,
  } as CallableRequest;
}

async function clearAll() {
  const auth = adminAuth();
  const list = await auth.listUsers();
  await Promise.all(list.users.map((u) => auth.deleteUser(u.uid).catch(() => {})));
  for (const c of ['users', 'audit_logs', 'rate_limits']) {
    const docs = await adminDb().collection(c).listDocuments();
    await Promise.all(docs.map((d) => d.delete()));
  }
}

describe('registerPasswordBuyer', () => {
  beforeEach(clearAll);

  it('creates a buyer+retail+active user doc + claims for a new password user', async () => {
    await adminAuth().createUser({ uid: 'p1', email: 'ana@example.com' });
    const res = await registerPasswordBuyerHandler(asPasswordUser('p1'));
    expect(res).toMatchObject({ uid: 'p1', role: 'buyer', audience: 'retail' });

    const d = (await adminDb().doc('users/p1').get()).data()!;
    expect(d['role']).toBe('buyer');
    expect(d['status']).toBe('active');
    expect(d['provider']).toBe('password');
    expect(d['profile'].audience).toBe('retail');
    expect(d['profile'].firstName).toBe('Ana');
    expect(d['profile'].lastName).toBe('Gomez');
    expect(d['profile'].documentNumber).toBeUndefined();

    const claims = (await adminAuth().getUser('p1')).customClaims;
    expect(claims).toMatchObject({ role: 'buyer', status: 'active', audience: 'retail' });

    const audit = await adminDb().collection('audit_logs').get();
    expect(audit.size).toBe(1);
    expect(audit.docs[0]!.data()['action']).toBe('user.self_register');
    expect(audit.docs[0]!.data()['after']).toMatchObject({ provider: 'password' });
  });

  it('does not overwrite an existing account (keeps staff role)', async () => {
    await adminAuth().createUser({ uid: 's1', email: 'staff@santarosa.com.py' });
    await adminDb()
      .doc('users/s1')
      .set({
        uid: 's1',
        role: 'staff',
        email: 'staff@santarosa.com.py',
        status: 'active',
        profile: { firstName: 'Staff', lastName: 'One' },
      });
    const res = await registerPasswordBuyerHandler(
      asPasswordUser('s1', { firstName: 'Staff', lastName: 'One' }, 'staff@santarosa.com.py'),
    );
    expect(res.role).toBe('staff');
    const d = (await adminDb().doc('users/s1').get()).data()!;
    expect(d['role']).toBe('staff');
  });

  it('ignores client-supplied role/audience/status (no privilege injection)', async () => {
    await adminAuth().createUser({ uid: 'inj1', email: 'inj@example.com' });
    const req = asPasswordUser(
      'inj1',
      {
        firstName: 'Mala',
        lastName: 'Intencion',
        role: 'admin',
        audience: 'wholesale',
        status: 'active',
      },
      'inj@example.com',
    );
    const res = await registerPasswordBuyerHandler(req);
    expect(res).toMatchObject({ role: 'buyer', audience: 'retail' });
    const d = (await adminDb().doc('users/inj1').get()).data()!;
    expect(d['role']).toBe('buyer');
    expect(d['profile'].audience).toBe('retail');
    const claims = (await adminAuth().getUser('inj1')).customClaims;
    expect(claims).toMatchObject({ role: 'buyer', audience: 'retail' });
  });

  it('rejects a password token with an unverified email', async () => {
    const req = {
      auth: {
        uid: 'unv1',
        token: {
          email: 'unv@example.com',
          email_verified: false,
          firebase: { sign_in_provider: 'password', identities: {} },
        } as never,
      },
      rawRequest: {} as never,
      data: { firstName: 'Un', lastName: 'Verified' },
    } as CallableRequest;
    await expect(registerPasswordBuyerHandler(req)).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    // Must not have provisioned anything.
    const d = await adminDb().doc('users/unv1').get();
    expect(d.exists).toBe(false);
  });

  it('rejects non-password providers', async () => {
    const req = {
      auth: {
        uid: 'g1',
        token: {
          email_verified: true,
          firebase: { sign_in_provider: 'google.com' },
        } as never,
      },
      rawRequest: {} as never,
      data: { firstName: 'Ana', lastName: 'Gomez' },
    } as CallableRequest;
    await expect(registerPasswordBuyerHandler(req)).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('rejects unauthenticated calls', async () => {
    const req = { rawRequest: {} as never, data: {} } as CallableRequest;
    await expect(registerPasswordBuyerHandler(req)).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  it('derives firstName/lastName from the token display name when the client sends no data (login-form fallback)', async () => {
    await adminAuth().createUser({ uid: 'nf1', email: 'nf@example.com' });
    const req = {
      auth: {
        uid: 'nf1',
        token: {
          email: 'nf@example.com',
          email_verified: true,
          name: 'Carla Duarte',
          firebase: { sign_in_provider: 'password', identities: {} },
        } as never,
      },
      rawRequest: {} as never,
      data: null,
    } as unknown as CallableRequest;
    const res = await registerPasswordBuyerHandler(req);
    expect(res).toMatchObject({ role: 'buyer', audience: 'retail' });
    const d = (await adminDb().doc('users/nf1').get()).data()!;
    expect(d['profile'].firstName).toBe('Carla');
    expect(d['profile'].lastName).toBe('Duarte');
  });

  it('falls back to the email local-part when neither explicit names nor a token display name exist', async () => {
    await adminAuth().createUser({ uid: 'nf2', email: 'sinnombre@example.com' });
    const req = {
      auth: {
        uid: 'nf2',
        token: {
          email: 'sinnombre@example.com',
          email_verified: true,
          firebase: { sign_in_provider: 'password', identities: {} },
        } as never,
      },
      rawRequest: {} as never,
      data: {},
    } as CallableRequest;
    const res = await registerPasswordBuyerHandler(req);
    expect(res).toMatchObject({ role: 'buyer', audience: 'retail' });
    const d = (await adminDb().doc('users/nf2').get()).data()!;
    expect(d['profile'].firstName).toBe('sinnombre');
    expect(d['profile'].lastName).toBe('');
  });

  it('rejects names with disallowed characters (script-injection attempt)', async () => {
    await adminAuth().createUser({ uid: 'xss1', email: 'xss@example.com' });
    await expect(
      registerPasswordBuyerHandler(
        asPasswordUser(
          'xss1',
          { firstName: '<img src=x onerror=alert(1)>', lastName: 'Gomez' },
          'xss@example.com',
        ),
      ),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    const d = await adminDb().doc('users/xss1').get();
    expect(d.exists).toBe(false);
  });

  it('rate-limits repeated registration attempts for the same uid', async () => {
    await adminAuth().createUser({ uid: 'rl1', email: 'rl@example.com' });
    const now = Date.now();
    await adminDb()
      .doc('rate_limits/register_rl1')
      .set({
        timestamps: Array.from({ length: 5 }, (_, i) => now - i * 1000),
      });
    await expect(
      registerPasswordBuyerHandler(asPasswordUser('rl1', undefined, 'rl@example.com')),
    ).rejects.toMatchObject({ code: 'resource-exhausted' });
    // Must not have provisioned anything either.
    const d = await adminDb().doc('users/rl1').get();
    expect(d.exists).toBe(false);
  });

  it('does not consume the rate limit budget when the account already exists', async () => {
    await adminAuth().createUser({ uid: 's2', email: 'staff2@santarosa.com.py' });
    await adminDb()
      .doc('users/s2')
      .set({
        uid: 's2',
        role: 'staff',
        email: 'staff2@santarosa.com.py',
        status: 'active',
        profile: { firstName: 'Staff', lastName: 'Two' },
      });
    // Call repeatedly, well past the ceiling that would apply to a real
    // provisioning attempt — every call is a no-op read, so none of this
    // should ever throw resource-exhausted.
    for (let i = 0; i < 8; i++) {
      const res = await registerPasswordBuyerHandler(
        asPasswordUser('s2', { firstName: 'Staff', lastName: 'Two' }, 'staff2@santarosa.com.py'),
      );
      expect(res.role).toBe('staff');
    }
  });
});
