import { describe, it, expect, beforeEach } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { adminAuth, adminDb } from '../lib/admin.js';
import { requestPasswordResetHandler } from './requestPasswordReset.js';

function call(email: unknown): CallableRequest {
  return { data: { email }, rawRequest: {} as never } as CallableRequest;
}

async function clearEmulators() {
  const auth = adminAuth();
  const list = await auth.listUsers();
  if (list.users.length > 0) await Promise.all(list.users.map((u) => auth.deleteUser(u.uid)));
  for (const c of ['users', 'rate_limits', 'password_reset_requests']) {
    const docs = await adminDb().collection(c).listDocuments();
    await Promise.all(docs.map((d) => d.delete()));
  }
}

describe('requestPasswordReset', () => {
  beforeEach(async () => {
    await clearEmulators();
  });

  it('returns ok for an unknown email without writing any bookkeeping', async () => {
    // Regression test for the reorder fix: existence check now runs BEFORE
    // any rate-limit write, so a fake email can no longer leave a permanent
    // rate_limits doc behind.
    const result = await requestPasswordResetHandler(call('ghost@example.com'));
    expect(result).toEqual({ ok: true });
    const rl = await adminDb().collection('rate_limits').listDocuments();
    const reqs = await adminDb().collection('password_reset_requests').get();
    expect(rl).toHaveLength(0);
    expect(reqs.size).toBe(0);
  });

  it('pads the unknown-email response to the timing floor (no latency side-channel)', async () => {
    const startedAt = Date.now();
    await requestPasswordResetHandler(call('ghost2@example.com'));
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(380);
  });

  it('creates a pending request + rate-limit doc for a known email', async () => {
    await adminAuth().createUser({ uid: 'u1', email: 'known@example.com', password: 'Aa1!aaaa' });
    await adminDb()
      .doc('users/u1')
      .set({ profile: { firstName: 'Ana', lastName: 'Gómez' } });

    const result = await requestPasswordResetHandler(call('known@example.com'));
    expect(result).toEqual({ ok: true });

    const reqs = await adminDb()
      .collection('password_reset_requests')
      .where('email', '==', 'known@example.com')
      .get();
    expect(reqs.size).toBe(1);
    expect(reqs.docs[0]!.data()).toMatchObject({
      uid: 'u1',
      status: 'pending',
      requestCount: 1,
      firstName: 'Ana',
      lastName: 'Gómez',
    });

    const emailKey = Buffer.from('known@example.com').toString('base64url').slice(0, 64);
    const rl = await adminDb().doc(`rate_limits/pwreset_${emailKey}`).get();
    expect((rl.data()?.['timestamps'] as unknown[]).length).toBe(1);
  });

  it('de-dupes repeated requests for the same email into one pending doc', async () => {
    await adminAuth().createUser({ uid: 'u2', email: 'dup@example.com', password: 'Aa1!aaaa' });
    await requestPasswordResetHandler(call('dup@example.com'));
    await requestPasswordResetHandler(call('dup@example.com'));

    const reqs = await adminDb()
      .collection('password_reset_requests')
      .where('email', '==', 'dup@example.com')
      .get();
    expect(reqs.size).toBe(1);
    expect(reqs.docs[0]!.data()['requestCount']).toBe(2);
  });

  it('caps rate-limit bookkeeping at RATE_LIMIT_MAX and stops advancing requestCount past it', async () => {
    await adminAuth().createUser({
      uid: 'u3',
      email: 'capped@example.com',
      password: 'Aa1!aaaa',
    });
    for (let i = 0; i < 4; i++) {
      await requestPasswordResetHandler(call('capped@example.com'));
    }
    const emailKey = Buffer.from('capped@example.com').toString('base64url').slice(0, 64);
    const rl = await adminDb().doc(`rate_limits/pwreset_${emailKey}`).get();
    expect((rl.data()?.['timestamps'] as unknown[]).length).toBe(3);

    const reqs = await adminDb()
      .collection('password_reset_requests')
      .where('email', '==', 'capped@example.com')
      .get();
    expect(reqs.docs[0]!.data()['requestCount']).toBe(3);
  });

  it('rejects malformed email input', async () => {
    await expect(requestPasswordResetHandler(call('not-an-email'))).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });
});
