import { describe, it, expect, beforeEach } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { adminAuth, adminDb } from '../lib/admin.js';
import { generatePasswordResetHandler } from './changePassword.js';

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
  if (list.users.length > 0) await Promise.all(list.users.map((u) => auth.deleteUser(u.uid)));
  const docs = await adminDb().collection('users').listDocuments();
  await Promise.all(docs.map((d) => d.delete()));
  const logs = await adminDb().collection('audit_logs').listDocuments();
  await Promise.all(logs.map((d) => d.delete()));
}

describe('generatePasswordReset', () => {
  beforeEach(async () => {
    await clearEmulators();
  });

  it('rejects non-admin caller', async () => {
    await adminAuth().createUser({
      uid: 'target',
      email: 'target@example.com',
      password: 'Aa1!aaaa',
    });
    await expect(
      generatePasswordResetHandler(asBuyer('buyer1', { uid: 'target' })),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('returns a reset link for an existing user', async () => {
    await adminAuth().createUser({
      uid: 'target',
      email: 'target@example.com',
      password: 'Aa1!aaaa',
    });
    const result = await generatePasswordResetHandler(asAdmin('admin-uid', { uid: 'target' }));
    expect(result.resetLink).toContain('http');
  });

  it('writes audit log', async () => {
    await adminAuth().createUser({
      uid: 'target',
      email: 'target@example.com',
      password: 'Aa1!aaaa',
    });
    await generatePasswordResetHandler(asAdmin('admin-7', { uid: 'target' }));
    const logs = await adminDb()
      .collection('audit_logs')
      .where('action', '==', 'user.password_reset_generated')
      .get();
    expect(logs.size).toBe(1);
    expect(logs.docs[0]!.data()['actorUid']).toBe('admin-7');
  });

  it('returns not-found for unknown user', async () => {
    await expect(
      generatePasswordResetHandler(asAdmin('admin-uid', { uid: 'ghost' })),
    ).rejects.toMatchObject({ code: 'not-found' });
  });
});
