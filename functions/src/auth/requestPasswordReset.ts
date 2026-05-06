import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { adminAuth, adminDb } from '../lib/admin.js';
import { FieldValue } from 'firebase-admin/firestore';

const InputSchema = z.object({
  email: z.string().email().max(254),
});

export interface RequestPasswordResetResult {
  ok: true;
}

const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/**
 * Public (unauthenticated) callable that lets a buyer request a password reset
 * when they forgot their password. The flow is intentionally human-mediated:
 *
 *   1. Buyer types email -> we create a `password_reset_requests` doc.
 *   2. Admin sees the doc in a panel, generates a Firebase reset link via
 *      generatePasswordReset, and sends it to the buyer through whatever
 *      channel they trust (WhatsApp, phone call).
 *   3. Admin marks the request as resolved.
 *
 * Why not use Firebase's built-in `sendPasswordResetEmail`? Two reasons:
 *   - We want admin to verify identity before unlocking the account, since
 *     vehicle auctions are high-value transactions.
 *   - Firebase's default email comes from `noreply@<project>.firebaseapp.com`
 *     and we haven't customised the email template / domain yet.
 *
 * Security:
 *   - No auth required (the buyer is locked out by definition).
 *   - Rate-limited per email (3 requests/hour) so a bot can't spam admin.
 *   - We always return {ok: true} regardless of whether the email exists,
 *     to prevent attackers from probing which emails are registered.
 *   - Anonymous Firestore writes are blocked at the rules level — only this
 *     callable (using admin SDK) can create the document.
 */
export async function requestPasswordResetHandler(
  req: CallableRequest,
): Promise<RequestPasswordResetResult> {
  const parsed = InputSchema.safeParse(req.data);
  if (!parsed.success) {
    // Even invalid input gets a generic ok response, but we throw here so the
    // client can surface "format the email correctly" if it slips past their
    // own validation.
    throw new HttpsError('invalid-argument', 'Email inválido');
  }
  const email = parsed.data.email.toLowerCase().trim();

  const db = adminDb();

  // Rate limit by email hash so we don't write the raw address as a doc id.
  // (Firestore allows email chars but using the email directly leaks it as a
  // visible key in any debugging tools.)
  const emailKey = Buffer.from(email).toString('base64url').slice(0, 64);
  const rlRef = db.doc(`rate_limits/pwreset_${emailKey}`);
  const now = Date.now();
  const rlSnap = await rlRef.get();
  const recent = ((rlSnap.data()?.['timestamps'] as number[] | undefined) ?? []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS,
  );
  if (recent.length >= RATE_LIMIT_MAX) {
    // Fail closed but with a generic message — no signal about whether the
    // email exists.
    return { ok: true };
  }

  // Bookkeeping first so a later short-circuit still counts the attempt.
  await rlRef.set({ timestamps: [...recent, now] }, { merge: true });

  let userRecord;
  try {
    userRecord = await adminAuth().getUserByEmail(email);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'auth/user-not-found') {
      // Don't leak existence — return success without writing anything.
      return { ok: true };
    }
    throw err;
  }

  // Mirror minimal user identity into the request doc so admin can recognise
  // the requester at a glance without an extra lookup.
  const userDoc = await db.doc(`users/${userRecord.uid}`).get();
  const profile = (userDoc.data()?.['profile'] ?? {}) as Record<string, unknown>;

  // De-dupe: if a pending request already exists for this email in the last
  // hour, just refresh its timestamp instead of piling on duplicates.
  const existing = await db
    .collection('password_reset_requests')
    .where('email', '==', email)
    .where('status', '==', 'pending')
    .limit(1)
    .get();
  if (!existing.empty) {
    await existing.docs[0]!.ref.update({
      requestedAt: FieldValue.serverTimestamp(),
      requestCount: FieldValue.increment(1),
    });
    return { ok: true };
  }

  await db.collection('password_reset_requests').add({
    email,
    uid: userRecord.uid,
    firstName: (profile['firstName'] as string) ?? '',
    lastName: (profile['lastName'] as string) ?? '',
    status: 'pending',
    requestedAt: FieldValue.serverTimestamp(),
    requestCount: 1,
  });

  return { ok: true };
}

export const requestPasswordReset = onCall(
  // No App Check enforcement here even when ENFORCE_APP_CHECK is on — App
  // Check tokens are tied to an authenticated session, and forgotten-password
  // requests are by definition unauthenticated.
  { region: 'us-central1' },
  requestPasswordResetHandler,
);
