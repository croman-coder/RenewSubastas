import { onSchedule } from 'firebase-functions/v2/scheduler';
import { adminAuth, adminDb } from '../lib/admin.js';
import { writeAuditLog } from '../lib/audit.js';

// Matches reset-tokens.ts's own TOKEN_TTL_HOURS — this codebase's existing
// convention for "how long is a pending self-service auth action allowed to
// sit before we consider it abandoned".
const DEFAULT_MIN_AGE_MS = 72 * 3600_000;
// Admin SDK listUsers()'s hard per-page cap.
const DEFAULT_PAGE_SIZE = 1000;

export interface SweepUnverifiedAccountsOptions {
  nowMs?: number;
  minAgeMs?: number;
  pageSize?: number;
}

export interface SweepUnverifiedAccountsResult {
  scanned: number;
  deleted: string[]; // emails (uid if the account somehow has none)
}

/**
 * Deletes abandoned password self-registrations: Auth users who never
 * verified their email, have no users/{uid} Firestore doc, and are older
 * than minAgeMs (default 72h). Never touches an invited account —
 * createUser.ts writes its Firestore doc immediately at invite time,
 * before the invitee ever sets a password, so "no doc" can only describe a
 * self-registration that registerPasswordBuyer's own precondition check
 * (see that file) never let past email verification. An account this
 * function is about to delete has, by construction, no role, no session,
 * and nothing referencing it anywhere else in Firestore.
 *
 * Why this matters beyond tidiness: registerPasswordBuyer is a public
 * callable — no auth, no App Check required to reach the point of
 * registering an address (only to finish, at verification). Anyone can
 * squat any address for free by starting, and never finishing, a
 * self-registration. Left unswept, that email is permanently unavailable
 * to createUser: adminAuth().createUser throws auth/email-already-exists
 * the moment a real admin later tries to invite that same person (see
 * createUser.ts's own handling of that error) — a cheap, targeted DoS on
 * staff onboarding, and one an attacker can aim at a specific address
 * (e.g. a known corporate handle before that hire's first day) with the
 * self-registration form's own "email already in use" response acting as
 * a free oracle for which addresses are still available.
 */
export async function runSweepUnverifiedAccounts(
  options: SweepUnverifiedAccountsOptions = {},
): Promise<SweepUnverifiedAccountsResult> {
  const nowMs = options.nowMs ?? Date.now();
  const minAgeMs = options.minAgeMs ?? DEFAULT_MIN_AGE_MS;
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;

  const auth = adminAuth();
  const db = adminDb();
  const deleted: string[] = [];
  let scanned = 0;
  let pageToken: string | undefined;

  do {
    const page = await auth.listUsers(pageSize, pageToken);
    for (const user of page.users) {
      scanned++;
      if (user.emailVerified) continue;
      const isPasswordUser = user.providerData.some((p) => p.providerId === 'password');
      if (!isPasswordUser) continue;
      const createdAtMs = new Date(user.metadata.creationTime).getTime();
      if (nowMs - createdAtMs < minAgeMs) continue;
      // The load-bearing check: an invited account already has this doc
      // (createUser.ts writes it at invite time, well before any password
      // is ever set), so its presence is proof this uid is NOT an
      // abandoned self-registration, regardless of anything else above.
      const doc = await db.doc(`users/${user.uid}`).get();
      if (doc.exists) continue;

      await auth.deleteUser(user.uid);
      // Best-effort: the rate-limit doc for a deleted uid is inert (never
      // read by anything else, and the uid can't call the callable again
      // to recreate it), just tidiness rather than a correctness fix.
      await db
        .doc(`rate_limits/register_${user.uid}`)
        .delete()
        .catch(() => {});
      deleted.push(user.email ?? user.uid);
    }
    pageToken = page.pageToken;
  } while (pageToken);

  if (deleted.length > 0) {
    await writeAuditLog({
      actorUid: 'system',
      action: 'user.sweep_unverified',
      resourceType: 'user',
      resourceId: 'batch',
      after: { deletedCount: deleted.length, emails: deleted },
    }).catch((err) => {
      console.error('[sweepUnverifiedAccounts] audit log failed', err);
    });
  }

  return { scanned, deleted };
}

export const sweepUnverifiedAccounts = onSchedule(
  {
    // dailyUnsoldDigest runs at 09:00, aggregateTraffic at 09:30 (both
    // America/Asuncion — see their own files). This runs earlier and
    // touches neither's collections (Auth users + the rate_limits/users
    // read below), so there's no ordering dependency — the stagger is
    // just the same "don't fire every daily batch job at once" courtesy.
    schedule: '0 8 * * *',
    timeZone: 'America/Asuncion',
    region: 'us-central1',
    // Same reasoning as aggregateTraffic.ts: caps this to one running
    // instance so a redelivered invocation can't race a still-running one
    // over the same Auth users.
    maxInstances: 1,
  },
  async () => {
    const r = await runSweepUnverifiedAccounts();
    console.log(`sweepUnverifiedAccounts: scanned=${r.scanned} deleted=${r.deleted.length}`);
  },
);
