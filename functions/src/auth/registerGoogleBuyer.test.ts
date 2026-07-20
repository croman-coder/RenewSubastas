import { describe, it, expect, beforeEach } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { adminAuth, adminDb } from '../lib/admin.js';
import { registerGoogleBuyerHandler } from './registerGoogleBuyer.js';

function asGoogleUser(uid: string, name = 'Ana Gomez', email = 'ana@gmail.com'): CallableRequest {
  return {
    auth: {
      uid,
      token: { email, name, firebase: { sign_in_provider: 'google.com', identities: {} } } as never,
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
    expect(res).toMatchObject({ uid: 'g1', role: 'buyer', audience: 'retail' });

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
    const d = (await adminDb().doc('users/s1').get()).data()!;
    expect(d['role']).toBe('staff');
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
