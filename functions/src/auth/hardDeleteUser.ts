import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { adminAuth, adminDb } from '../lib/admin.js';
import { writeAuditLog } from '../lib/audit.js';
import { requireAdmin } from '../lib/errors.js';

const InputSchema = z.object({ uid: z.string().min(1) });

export interface HardDeleteUserResult {
  ok: true;
}

/**
 * Permanently destroys a user. Unlike `deleteUser` (which is a soft-disable
 * that preserves the email so it can't be reused), this:
 *
 *   - Deletes the Firebase Auth account, freeing up the email for new signups
 *   - Removes the Firestore user doc
 *
 * Guardrails:
 *   - Admin-only
 *   - The target must already be in `status: 'disabled'` (forces the soft-delete
 *     two-step so this can't be triggered accidentally)
 *   - Cannot hard-delete admins (must demote first) and cannot hard-delete self
 *
 * NOTE: bids, auctions, and audit logs that reference this uid stay intact —
 * they're history, not the user record. They'll just point at a uid that no
 * longer resolves, which is correct behavior for a permanent deletion.
 */
export async function hardDeleteUserHandler(req: CallableRequest): Promise<HardDeleteUserResult> {
  const { uid: actorUid } = requireAdmin(req);
  const parsed = InputSchema.safeParse(req.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Invalid input');
  const targetUid = parsed.data.uid;

  if (targetUid === actorUid) {
    throw new HttpsError('permission-denied', 'Cannot hard-delete your own account');
  }

  const ref = adminDb().doc(`users/${targetUid}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'User not found');
  const before = snap.data()!;

  if (before['role'] === 'admin') {
    throw new HttpsError(
      'failed-precondition',
      'Cannot hard-delete an admin. Demote first, then hard-delete.',
    );
  }
  if (before['status'] !== 'disabled') {
    throw new HttpsError(
      'failed-precondition',
      'User must be disabled before hard-delete. Use the soft-delete first.',
    );
  }

  // Auth deletion frees the email for reuse. If the Auth user is already gone
  // (e.g. previously deleted directly in the console), proceed with the
  // Firestore cleanup anyway so the doc doesn't linger.
  try {
    await adminAuth().deleteUser(targetUid);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== 'auth/user-not-found') throw err;
  }

  await ref.delete();

  await writeAuditLog({
    actorUid,
    action: 'user.hard_delete',
    resourceType: 'user',
    resourceId: targetUid,
    before: {
      role: before['role'],
      status: before['status'],
      email: before['email'],
    },
  });

  return { ok: true };
}

export const hardDeleteUser = onCall(
  { region: 'us-central1', enforceAppCheck: process.env['ENFORCE_APP_CHECK'] === 'true' },
  hardDeleteUserHandler,
);
