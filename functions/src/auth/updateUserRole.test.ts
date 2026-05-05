import { describe, it, expect, beforeEach } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { adminAuth, adminDb } from '../lib/admin.js';
import { updateUserRoleHandler } from './updateUserRole.js';
import { FieldValue } from 'firebase-admin/firestore';

function asAdmin(uid = 'admin-uid', data: Record<string, unknown> = {}): CallableRequest {
  return {
    auth: { uid, token: { role: 'admin', status: 'active' } as never },
    rawRequest: {} as never,
    data,
  } as CallableRequest;
}

function asStaff(data: Record<string, unknown> = {}): CallableRequest {
  return {
    auth: { uid: 'staff-uid', token: { role: 'staff', status: 'active' } as never },
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
  email?: string,
) {
  const userEmail = email ?? `${uid}@example.com`;
  await adminAuth().createUser({ uid, email: userEmail, password: 'Aa1!aaaa' });
  await adminAuth().setCustomUserClaims(uid, { role, status });
  await adminDb()
    .doc(`users/${uid}`)
    .set({
      uid,
      role,
      email: userEmail,
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

describe('updateUserRole', () => {
  beforeEach(async () => {
    await clearEmulators();
  });

  it('rejects non-admin caller', async () => {
    await seedUser('target', 'buyer');
    const req = asStaff({ uid: 'target', role: 'staff' });
    await expect(updateUserRoleHandler(req)).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('rejects when neither role nor status provided', async () => {
    await seedUser('target', 'buyer');
    const req = asAdmin('admin-uid', { uid: 'target' });
    await expect(updateUserRoleHandler(req)).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('returns not-found when target user does not exist', async () => {
    const req = asAdmin('admin-uid', { uid: 'ghost', role: 'staff' });
    await expect(updateUserRoleHandler(req)).rejects.toMatchObject({ code: 'not-found' });
  });

  it('updates role and Auth custom claims', async () => {
    await seedUser('target', 'buyer', 'active', 'target@santarosa.com.py');
    const req = asAdmin('admin-uid', { uid: 'target', role: 'staff' });
    await updateUserRoleHandler(req);
    const doc = await adminDb().doc('users/target').get();
    expect(doc.data()?.['role']).toBe('staff');
    const userRecord = await adminAuth().getUser('target');
    expect(userRecord.customClaims?.['role']).toBe('staff');
  });

  it('toggles status from active to disabled', async () => {
    await seedUser('target', 'buyer', 'active');
    const req = asAdmin('admin-uid', { uid: 'target', status: 'disabled' });
    await updateUserRoleHandler(req);
    const doc = await adminDb().doc('users/target').get();
    expect(doc.data()?.['status']).toBe('disabled');
    const userRecord = await adminAuth().getUser('target');
    expect(userRecord.customClaims?.['status']).toBe('disabled');
  });

  it('writes audit log with before/after', async () => {
    await seedUser('target', 'buyer', 'active', 'target@santarosa.com.py');
    await updateUserRoleHandler(asAdmin('admin-1', { uid: 'target', role: 'staff' }));
    const logs = await adminDb()
      .collection('audit_logs')
      .where('action', '==', 'user.update_role')
      .get();
    expect(logs.size).toBe(1);
    const log = logs.docs[0]!.data();
    expect(log['before']).toMatchObject({ role: 'buyer' });
    expect(log['after']).toMatchObject({ role: 'staff' });
  });

  it('rejects promoting buyer with non-santarosa email to staff', async () => {
    // seedUser uses `${uid}@example.com` so this is never santarosa.com.py
    await seedUser('victim', 'buyer');
    await expect(
      updateUserRoleHandler(asAdmin('admin-uid', { uid: 'victim', role: 'staff' })),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('rejects admin disabling themselves', async () => {
    await seedUser('admin-uid', 'admin');
    await expect(
      updateUserRoleHandler(asAdmin('admin-uid', { uid: 'admin-uid', status: 'disabled' })),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('rejects demoting last active admin', async () => {
    await seedUser('admin-uid', 'admin');
    await expect(
      updateUserRoleHandler(asAdmin('admin-uid', { uid: 'admin-uid', role: 'staff' })),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('allows demoting an admin to buyer when another active admin exists', async () => {
    await seedUser('admin-uid', 'admin');
    await seedUser('admin-2', 'admin');
    await updateUserRoleHandler(asAdmin('admin-uid', { uid: 'admin-2', role: 'buyer' }));
    const doc = await adminDb().doc('users/admin-2').get();
    expect(doc.data()?.['role']).toBe('buyer');
  });
});
