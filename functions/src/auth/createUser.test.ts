import { describe, it, expect, beforeEach } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { adminAuth, adminDb } from '../lib/admin.js';
import { createUserHandler } from './createUser.js';

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

describe('createUser', () => {
  beforeEach(async () => {
    await clearEmulators();
  });

  it('lets staff create a buyer but not an admin', async () => {
    // Staff handle day-to-day buyer onboarding, so creating a buyer succeeds…
    const okReq = asStaff({
      role: 'buyer',
      email: 'buyer@example.com',
      firstName: 'Juan',
      lastName: 'Perez',
      documentType: 'CI',
      documentNumber: '1234567',
    });
    const res = await createUserHandler(okReq);
    expect(res.uid).toBeTruthy();

    // …but staff can never mint an admin — the top tier stays admin-only.
    const adminReq = asStaff({
      role: 'admin',
      email: 'admin2@santarosa.com.py',
      firstName: 'Eva',
      lastName: 'Gomez',
      documentType: 'CI',
      documentNumber: '7654321',
    });
    await expect(createUserHandler(adminReq)).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('rejects calls from a buyer (no create privilege)', async () => {
    const req = {
      auth: { uid: 'buyer-uid', token: { role: 'buyer', status: 'active' } as never },
      rawRequest: {} as never,
      data: {
        role: 'buyer',
        email: 'buyer2@example.com',
        firstName: 'Ana',
        lastName: 'Diaz',
        documentType: 'CI',
        documentNumber: '2233445',
      },
    } as CallableRequest;
    await expect(createUserHandler(req)).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('rejects admin/staff email outside santarosa.com.py domain', async () => {
    const req = asAdmin('admin-uid', {
      role: 'staff',
      email: 'staff@gmail.com',
      firstName: 'Maria',
      lastName: 'Lopez',
      documentType: 'CI',
      documentNumber: '7654321',
    });
    await expect(createUserHandler(req)).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('accepts buyer with any email domain and creates user doc', async () => {
    const req = asAdmin('admin-uid', {
      role: 'buyer',
      email: 'buyer1@gmail.com',
      firstName: 'Carlos',
      lastName: 'Diaz',
      documentType: 'CI',
      documentNumber: '9876543',
    });
    const result = await createUserHandler(req);
    expect(result.uid).toBeTypeOf('string');
    expect(result.resetLink).toContain('http');
    const userDoc = await adminDb().doc(`users/${result.uid}`).get();
    expect(userDoc.exists).toBe(true);
    const data = userDoc.data()!;
    expect(data['role']).toBe('buyer');
    expect(data['status']).toBe('active');
    expect(data['profile'].documentNumber).toBe('9876543');
  });

  it('rejects invalid Paraguay RUC', async () => {
    const req = asAdmin('admin-uid', {
      role: 'staff',
      email: 'staff@santarosa.com.py',
      firstName: 'Ana',
      lastName: 'Gomez',
      documentType: 'RUC',
      documentNumber: '80012345-9', // wrong check digit (correct is -3)
    });
    await expect(createUserHandler(req)).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('writes audit log on success', async () => {
    const req = asAdmin('admin-1', {
      role: 'buyer',
      email: 'b1@example.com',
      firstName: 'Pedro',
      lastName: 'Ruiz',
      documentType: 'CI',
      documentNumber: '5555555',
    });
    await createUserHandler(req);
    const logs = await adminDb()
      .collection('audit_logs')
      .where('action', '==', 'user.create')
      .get();
    expect(logs.size).toBe(1);
    expect(logs.docs[0]!.data()['actorUid']).toBe('admin-1');
  });

  it('rejects unauthenticated calls', async () => {
    const req = { rawRequest: {} as never, data: {} } as CallableRequest;
    await expect(createUserHandler(req)).rejects.toMatchObject({ code: 'unauthenticated' });
  });
});
