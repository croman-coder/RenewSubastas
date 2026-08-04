import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { adminDb } from '../lib/admin.js';
import { requireSignedIn } from '../lib/errors.js';
import { FieldValue } from 'firebase-admin/firestore';

const InputSchema = z.object({
  // FCM tokens are opaque strings up to ~200 chars. We cap at 4096 to
  // refuse anything that's clearly not a real token while still
  // accommodating any future format growth.
  token: z.string().min(20).max(4096),
});

export interface SavePushTokenResult {
  ok: true;
}

/**
 * Stores an FCM web-push token on the calling user. Each user keeps an
 * array of `{ token, platform, updatedAt }` entries — one device per
 * token — so a buyer who installs Renew on phone + laptop receives
 * pushes on both. Duplicates are de-duped by the token string itself;
 * the cron sweeper (separate) reaps tokens older than 60 days.
 *
 * The Cloud Function holding the FCM Admin SDK is the only path that
 * reads these tokens; Firestore rules block direct read of the
 * `fcmTokens` field via a path guard, so a tokens leak would require
 * compromising the service account.
 */
export async function savePushTokenHandler(req: CallableRequest): Promise<SavePushTokenResult> {
  const { uid } = requireSignedIn(req);
  const parsed = InputSchema.safeParse(req.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Invalid token');
  const { token } = parsed.data;

  const ref = adminDb().doc(`users/${uid}`);
  const snap = await ref.get();
  const existing = ((snap.data()?.['fcmTokens'] as Array<{ token: string }> | undefined) ??
    []) as Array<{ token: string; platform: string; updatedAt: FirebaseFirestore.Timestamp }>;

  // De-dupe: if we already have this token, just refresh its timestamp
  // so the sweeper keeps it alive. Otherwise append.
  const filtered = existing.filter((t) => t.token !== token);
  const next = [
    ...filtered,
    {
      token,
      platform: 'web',
      updatedAt: FieldValue.serverTimestamp() as unknown as FirebaseFirestore.Timestamp,
    },
  ];

  // Keep at most 10 tokens per user to bound array size — a real human
  // is unlikely to have more than 3-4 devices, and stale tokens get
  // pruned naturally as we exceed the cap (oldest first).
  const trimmed = next.length > 10 ? next.slice(-10) : next;

  await ref.update({
    fcmTokens: trimmed,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { ok: true };
}

export const savePushToken = onCall(
  { region: 'us-central1', enforceAppCheck: process.env['ENFORCE_APP_CHECK'] !== 'false' },
  savePushTokenHandler,
);
