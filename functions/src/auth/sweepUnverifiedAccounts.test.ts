import { describe, it, expect, beforeEach } from 'vitest';
import { adminAuth, adminDb } from '../lib/admin.js';
import { runSweepUnverifiedAccounts } from './sweepUnverifiedAccounts.js';

const MIN_AGE_MS = 72 * 3600_000;
// "Now" far enough past real creation time that every seeded user in this
// suite reads as older than MIN_AGE_MS — age is controlled by adjusting
// nowMs per call, not by faking each user's actual creationTime (the Auth
// emulator sets that itself, always to real "now").
const FAR_FUTURE = Date.now() + 100 * 3600_000;

async function clearAll() {
  const auth = adminAuth();
  const list = await auth.listUsers();
  await Promise.all(list.users.map((u) => auth.deleteUser(u.uid).catch(() => {})));
  for (const c of ['users', 'rate_limits', 'audit_logs']) {
    const docs = await adminDb().collection(c).listDocuments();
    await Promise.all(docs.map((d) => d.delete()));
  }
}

describe('sweepUnverifiedAccounts', () => {
  beforeEach(clearAll);

  it('deletes an old, unverified, doc-less password account (abandoned self-registration)', async () => {
    await adminAuth().createUser({
      uid: 'abandoned1',
      email: 'abandoned@example.com',
      password: 'ClaveSegura1',
      emailVerified: false,
    });
    const res = await runSweepUnverifiedAccounts({ nowMs: FAR_FUTURE, minAgeMs: MIN_AGE_MS });
    expect(res.deleted).toEqual(['abandoned@example.com']);
    await expect(adminAuth().getUser('abandoned1')).rejects.toMatchObject({
      code: 'auth/user-not-found',
    });
  });

  it('never touches a verified account', async () => {
    await adminAuth().createUser({
      uid: 'verified1',
      email: 'verified@example.com',
      password: 'ClaveSegura1',
      emailVerified: true,
    });
    const res = await runSweepUnverifiedAccounts({ nowMs: FAR_FUTURE, minAgeMs: MIN_AGE_MS });
    expect(res.deleted).toEqual([]);
    await expect(adminAuth().getUser('verified1')).resolves.toBeTruthy();
  });

  // The load-bearing safety check: an invited account (createUser.ts) is
  // ALSO created with emailVerified:false, but it gets its Firestore doc
  // immediately, before the invitee ever sets a password. This is the one
  // case the sweep must never delete, or it would break staff onboarding
  // instead of fixing it.
  it('never touches an unverified account that already has a users/{uid} doc (an invited account)', async () => {
    await adminAuth().createUser({
      uid: 'invited1',
      email: 'invited@santarosa.com.py',
      password: 'temp-password-1',
      emailVerified: false,
    });
    await adminDb()
      .doc('users/invited1')
      .set({
        uid: 'invited1',
        role: 'staff',
        email: 'invited@santarosa.com.py',
        status: 'active',
        profile: { firstName: 'Nueva', lastName: 'Persona' },
      });
    const res = await runSweepUnverifiedAccounts({ nowMs: FAR_FUTURE, minAgeMs: MIN_AGE_MS });
    expect(res.deleted).toEqual([]);
    await expect(adminAuth().getUser('invited1')).resolves.toBeTruthy();
  });

  it('never touches an unverified account younger than minAgeMs', async () => {
    await adminAuth().createUser({
      uid: 'fresh1',
      email: 'fresh@example.com',
      password: 'ClaveSegura1',
      emailVerified: false,
    });
    // "Now" is real wall-clock time here — the account was just created,
    // so its age is ~0, far under any minAgeMs.
    const res = await runSweepUnverifiedAccounts({ nowMs: Date.now(), minAgeMs: MIN_AGE_MS });
    expect(res.deleted).toEqual([]);
    await expect(adminAuth().getUser('fresh1')).resolves.toBeTruthy();
  });

  it('cleans up the orphaned rate-limit doc alongside the deleted account', async () => {
    await adminAuth().createUser({
      uid: 'abandoned2',
      email: 'abandoned2@example.com',
      password: 'ClaveSegura1',
      emailVerified: false,
    });
    await adminDb()
      .doc('rate_limits/register_abandoned2')
      .set({ timestamps: [Date.now()] });
    await runSweepUnverifiedAccounts({ nowMs: FAR_FUTURE, minAgeMs: MIN_AGE_MS });
    const rl = await adminDb().doc('rate_limits/register_abandoned2').get();
    expect(rl.exists).toBe(false);
  });

  it('writes a single summary audit log entry for the whole run', async () => {
    await adminAuth().createUser({
      uid: 'abandoned3',
      email: 'abandoned3@example.com',
      password: 'ClaveSegura1',
      emailVerified: false,
    });
    await adminAuth().createUser({
      uid: 'abandoned4',
      email: 'abandoned4@example.com',
      password: 'ClaveSegura1',
      emailVerified: false,
    });
    await runSweepUnverifiedAccounts({ nowMs: FAR_FUTURE, minAgeMs: MIN_AGE_MS });
    const logs = await adminDb()
      .collection('audit_logs')
      .where('action', '==', 'user.sweep_unverified')
      .get();
    expect(logs.size).toBe(1);
    expect(logs.docs[0]!.data()['after']).toMatchObject({ deletedCount: 2 });
  });

  it('writes no audit log when nothing was deleted', async () => {
    await runSweepUnverifiedAccounts({ nowMs: FAR_FUTURE, minAgeMs: MIN_AGE_MS });
    const logs = await adminDb()
      .collection('audit_logs')
      .where('action', '==', 'user.sweep_unverified')
      .get();
    expect(logs.size).toBe(0);
  });

  it('ignores an account with no password provider even if somehow unverified', async () => {
    // Not a realistic real-world state (every account in this app either
    // sets a password at creation — createUser.ts, password
    // self-registration — or is Google, which always reports verified),
    // but the provider check is what makes that guarantee hold, so it's
    // worth testing directly rather than only by absence of a counterexample.
    await adminAuth().createUser({
      uid: 'noprovider1',
      email: 'noprovider1@example.com',
      emailVerified: false,
    });
    const res = await runSweepUnverifiedAccounts({ nowMs: FAR_FUTURE, minAgeMs: MIN_AGE_MS });
    expect(res.deleted).toEqual([]);
  });
});
