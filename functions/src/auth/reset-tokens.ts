import { createHash, randomBytes } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '../lib/admin.js';
import { SITE_URL } from '../lib/email-templates.js';

// Self-issued password-set tokens. We don't use Firebase's oobCode for the
// welcome / reset flow because its lifetime is fixed at ~1h and not
// configurable. These tokens are cryptographically random, single-use,
// stored only as a SHA-256 hash, and expire after a configurable TTL.
const TOKEN_TTL_HOURS = 72;
const COLLECTION = 'password_set_tokens';

export type ResetPurpose = 'welcome' | 'reset';

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

/**
 * Issues a fresh password-set token for `uid` and returns the branded link the
 * user clicks. The raw token lives only in the link/email; Firestore stores
 * just its hash (as the doc id) so a DB leak can't be used to set passwords.
 */
export async function issuePasswordSetLink(
  uid: string,
  email: string,
  purpose: ResetPurpose,
  locale = 'es',
): Promise<string> {
  const token = randomBytes(32).toString('hex'); // 256-bit, 64 hex chars
  const id = sha256(token);
  const now = Date.now();
  await adminDb()
    .collection(COLLECTION)
    .doc(id)
    .set({
      uid,
      email,
      purpose,
      createdAt: Timestamp.fromMillis(now),
      expiresAt: Timestamp.fromMillis(now + TOKEN_TTL_HOURS * 3600_000),
      usedAt: null,
    });
  const url = new URL(`${SITE_URL}/${locale}/auth/set-password`);
  url.searchParams.set('token', token);
  return url.toString();
}

export interface ConsumedToken {
  uid: string;
  email: string;
  purpose: ResetPurpose;
}

/**
 * Validates and consumes a token. Throws a string error code on failure:
 * 'invalid' (unknown), 'used' (already redeemed), 'expired'. On success the
 * token is marked used (single-use) and the target uid is returned.
 */
export async function consumePasswordSetToken(token: string): Promise<ConsumedToken> {
  if (!token || typeof token !== 'string') throw 'invalid';
  const id = sha256(token);
  const ref = adminDb().collection(COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw 'invalid';
  const d = snap.data()!;
  if (d['usedAt']) throw 'used';
  const expiresAt = d['expiresAt'] as Timestamp | undefined;
  if (!expiresAt || expiresAt.toMillis() <= Date.now()) throw 'expired';
  await ref.update({ usedAt: Timestamp.now() });
  return {
    uid: d['uid'] as string,
    email: (d['email'] as string) ?? '',
    purpose: (d['purpose'] as ResetPurpose) ?? 'reset',
  };
}
