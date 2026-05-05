import { describe, it, expect, beforeEach } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { adminAuth, adminDb } from '../lib/admin.js';
import { deleteUserHandler } from './deleteUser.js';
import { FieldValue } from 'firebase-admin/firestore';

function asAdmin(uid = 'admin-uid', data: Record<string, unknown> = {}): CallableRequest {
  return {
    auth: { uid, token: { role: 'admin', status: 'active' } as never },
    rawRequest: {} as never,
    data,
  } as CallableRequest;
}

function asBuyer(uid: string, data: Record<string, unknown> = {}): CallableRequest {
  return {
    auth: { uid, token: { role: 'buyer', status: 'active' } as never },
    rawRequest: {} as never,
    data,
  } as CallableRequest;
}

async function clearEmulators() {
  const auth = adminAuth();
  const list = await auth.listUsers();
  if (list.users.length > 0) {
    await Promise.all(list.users.map((u) => auth.deleteUser(u.uid)));
  }
  const docs = await adminDb().collection('users').listDocuments();
  await Promise.all(docs.map((d) => d.delete()));
  const logs = await adminDb().collection('audit_logs').listDocuments();
  await Promise.all(logs.map((d) => d.delete()));
}

async function seedUser(
  uid: string,
  role: 'admin' | 'staff' | 'buyer',
  status: 'active' | 'disabled' = 'active',
) {
  await adminAuth().createUser({ uid, email: `${uid}@example.com`, password: 'Aa1!aaaa' });
  await adminAuth().setCustomUserClaims(uid, { role, status });
  await adminDb()
    .doc(`users/${uid}`)
    .set({
      uid,
      role,
      email: `${uid}@example.com`,
      status,
      profile: { firstName: 'F', lastName: 'L', documentType: 'CI', documentNumber: '1234567' },
      preferences: {
        locale: 'es',
        theme: 'system',
        notifications: { outbidEmail: true, auctionWonEmail: true, newAuctionEmail: false },
      },
      createdBy: 'bootstrap',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
}

describe('deleteUser', () => {
  beforeEach(async () => {
    await clearEmulators();
  });

  it('rejects buyer deleting another user', async () => {
    await seedUser('buyer-a', 'buyer');
    await seedUser('buyer-b', 'buyer');
    const req = asBuyer('buyer-a', { uid: 'buyer-b' });
    await expect(deleteUserHandler(req)).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('allows buyer to delete self (soft delete)', async () => {
    await seedUser('buyer-self', 'buyer');
    await deleteUserHandler(asBuyer('buyer-self', { uid: 'buyer-self' }));
    const doc = await adminDb().doc('users/buyer-self').get();
    expect(doc.data()?.['status']).toBe('disabled');
    expect(doc.data()?.['deletedAt']).toBeDefined();
    const userRecord = await adminAuth().getUser('buyer-self');
    expect(userRecord.disabled).toBe(true);
  });

  it('allows admin to delete buyer', async () => {
    await seedUser('victim', 'buyer');
    await deleteUserHandler(asAdmin('admin-uid', { uid: 'victim' }));
    const doc = await adminDb().doc('users/victim').get();
    expect(doc.data()?.['status']).toBe('disabled');
  });

  it('allows admin to delete staff', async () => {
    await seedUser('staffer', 'staff');
    await deleteUserHandler(asAdmin('admin-uid', { uid: 'staffer' }));
    const doc = await adminDb().doc('users/staffer').get();
    expect(doc.data()?.['status']).toBe('disabled');
  });

  it('rejects admin deleting another admin', async () => {
    await seedUser('admin2', 'admin');
    const req = asAdmin('admin-uid', { uid: 'admin2' });
    await expect(deleteUserHandler(req)).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('returns not-found for unknown user', async () => {
    const req = asAdmin('admin-uid', { uid: 'ghost' });
    await expect(deleteUserHandler(req)).rejects.toMatchObject({ code: 'not-found' });
  });

  it('writes audit log', async () => {
    await seedUser('victim', 'buyer');
    await deleteUserHandler(asAdmin('admin-1', { uid: 'victim' }));
    const logs = await adminDb()
      .collection('audit_logs')
      .where('action', '==', 'user.delete')
      .get();
    expect(logs.size).toBe(1);
    expect(logs.docs[0]!.data()['actorUid']).toBe('admin-1');
  });
});
