import { describe, it, expect, beforeEach } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { adminAuth, adminDb } from '../lib/admin.js';
import { registerGoogleBuyerHandler } from './registerGoogleBuyer.js';

function asGoogleUser(uid: string, name = 'Ana Gomez', email = 'ana@gmail.com'): CallableRequest {
  return {
    auth: {
      uid,
      token: {
        email,
        email_verified: true,
        name,
        firebase: { sign_in_provider: 'google.com', identities: {} },
      } as never,
    },
    rawRequest: {} as never,
    data: {},
  } as CallableRequest;
}

async function clearAll() {
  const auth = adminAuth();
  const list = await auth.listUsers();
  await Promise.all(list.users.map((u) => auth.deleteUser(u.uid).catch(() => {})));
  for (const c of ['users', 'audit_logs']) {
    const docs = await adminDb().collection(c).listDocuments();
    await Promise.all(docs.map((d) => d.delete()));
  }
}

describe('registerGoogleBuyer', () => {
  beforeEach(clearAll);

  it('creates a buyer+retail+active user doc + claims for a new Google user', async () => {
    await adminAuth().createUser({ uid: 'g1', email: 'ana@gmail.com' });
    const res = await registerGoogleBuyerHandler(asGoogleUser('g1'));
    expect(res).toMatchObject({ uid: 'g1', role: 'buyer', audience: 'retail', isNew: true });

    const d = (await adminDb().doc('users/g1').get()).data()!;
    expect(d['role']).toBe('buyer');
    expect(d['status']).toBe('active');
    expect(d['profile'].audience).toBe('retail');
    expect(d['profile'].firstName).toBe('Ana');
    expect(d['profile'].lastName).toBe('Gomez');
    expect(d['profile'].documentNumber).toBeUndefined();

    const claims = (await adminAuth().getUser('g1')).customClaims;
    expect(claims).toMatchObject({ role: 'buyer', status: 'active', audience: 'retail' });
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
    const res = await registerGoogleBuyerHandler(
      asGoogleUser('s1', 'Staff One', 'staff@santarosa.com.py'),
    );
    expect(res.role).toBe('staff');
    expect(res.isNew).toBe(false);
    const d = (await adminDb().doc('users/s1').get()).data()!;
    expect(d['role']).toBe('staff');
  });

  it('reports isNew only on the call that actually creates the account', async () => {
    // CompleteRegistration is the event the ad campaign optimises against, so
    // a returning buyer signing in again must never look like a new sign-up.
    await adminAuth().createUser({ uid: 'g2', email: 'repeat@gmail.com' });
    const first = await registerGoogleBuyerHandler(
      asGoogleUser('g2', 'Ana Gomez', 'repeat@gmail.com'),
    );
    expect(first.isNew).toBe(true);
    const second = await registerGoogleBuyerHandler(
      asGoogleUser('g2', 'Ana Gomez', 'repeat@gmail.com'),
    );
    expect(second.isNew).toBe(false);
  });

  it('ignores client-supplied role/audience (no privilege injection)', async () => {
    await adminAuth().createUser({ uid: 'inj1', email: 'inj@gmail.com' });
    const req = asGoogleUser('inj1', 'Mala Intencion', 'inj@gmail.com');
    // Attacker tries to smuggle elevated role/audience through the callable data.
    (req as { data: unknown }).data = { role: 'admin', audience: 'wholesale' };
    const res = await registerGoogleBuyerHandler(req);
    expect(res).toMatchObject({ role: 'buyer', audience: 'retail' });
    const d = (await adminDb().doc('users/inj1').get()).data()!;
    expect(d['role']).toBe('buyer');
    expect(d['profile'].audience).toBe('retail');
    const claims = (await adminAuth().getUser('inj1')).customClaims;
    expect(claims).toMatchObject({ role: 'buyer', audience: 'retail' });
  });

  it('rejects a Google token with an unverified email', async () => {
    const req = {
      auth: {
        uid: 'unv1',
        token: {
          email: 'unv@gmail.com',
          email_verified: false,
          name: 'Un Verified',
          firebase: { sign_in_provider: 'google.com', identities: {} },
        } as never,
      },
      rawRequest: {} as never,
      data: {},
    } as CallableRequest;
    await expect(registerGoogleBuyerHandler(req)).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('rejects non-google providers', async () => {
    const req = {
      auth: { uid: 'x', token: { firebase: { sign_in_provider: 'password' } } as never },
      rawRequest: {} as never,
      data: {},
    } as CallableRequest;
    await expect(registerGoogleBuyerHandler(req)).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('rejects unauthenticated calls', async () => {
    const req = { rawRequest: {} as never, data: {} } as CallableRequest;
    await expect(registerGoogleBuyerHandler(req)).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });
});
