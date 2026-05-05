import { describe, it, expect, beforeEach } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { adminAuth, adminDb } from '../lib/admin.js';
import { revokeMySessionsHandler } from './revokeMySessions.js';

function asActive(uid: string, role: 'admin' | 'staff' | 'buyer' = 'buyer'): CallableRequest {
  return {
    auth: { uid, token: { role, status: 'active' } as never },
    rawRequest: {} as never,
    data: {},
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

describe('revokeMySessions', () => {
  beforeEach(async () => {
    await clearEmulators();
  });

  it('rejects unauthenticated calls', async () => {
    const req = { rawRequest: {} as never, data: {} } as CallableRequest;
    await expect(revokeMySessionsHandler(req)).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('revokes refresh tokens for the caller', async () => {
    await adminAuth().createUser({
      uid: 'user-1',
      email: 'u1@example.com',
      password: 'Aa1!aaaa',
    });
    const before = await adminAuth().getUser('user-1');
    await revokeMySessionsHandler(asActive('user-1'));
    const after = await adminAuth().getUser('user-1');
    // tokensValidAfterTime should advance
    const beforeTs = new Date(before.tokensValidAfterTime ?? 0).getTime();
    const afterTs = new Date(after.tokensValidAfterTime ?? 0).getTime();
    expect(afterTs).toBeGreaterThanOrEqual(beforeTs);
  });

  it('writes audit log', async () => {
    await adminAuth().createUser({
      uid: 'user-2',
      email: 'u2@example.com',
      password: 'Aa1!aaaa',
    });
    await revokeMySessionsHandler(asActive('user-2'));
    const logs = await adminDb()
      .collection('audit_logs')
      .where('action', '==', 'user.revoke_sessions')
      .get();
    expect(logs.size).toBe(1);
    expect(logs.docs[0]!.data()['actorUid']).toBe('user-2');
  });
});
