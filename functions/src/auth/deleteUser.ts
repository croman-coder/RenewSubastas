import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { adminAuth, adminDb } from '../lib/admin.js';
import { writeAuditLog } from '../lib/audit.js';
import { requireSignedIn } from '../lib/errors.js';
import { DocId } from '../lib/ids.js';
import { FieldValue } from 'firebase-admin/firestore';

const InputSchema = z.object({ uid: DocId });

export interface DeleteUserResult {
  ok: true;
}

export async function deleteUserHandler(req: CallableRequest): Promise<DeleteUserResult> {
  const { uid: actorUid, role: actorRole } = requireSignedIn(req);
  const parsed = InputSchema.safeParse(req.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Invalid input');
  const targetUid = parsed.data.uid;

  const ref = adminDb().doc(`users/${targetUid}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'User not found');
  const before = snap.data()!;

  const isSelfBuyer = actorUid === targetUid && actorRole === 'buyer';
  const isAdminDeletingNonAdmin = actorRole === 'admin' && before['role'] !== 'admin';

  if (!isSelfBuyer && !isAdminDeletingNonAdmin) {
    throw new HttpsError('permission-denied', 'Not authorized to delete this user');
  }

  try {
    await adminAuth().revokeRefreshTokens(targetUid);
    await adminAuth().updateUser(targetUid, { disabled: true });
    await adminAuth().setCustomUserClaims(targetUid, null);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== 'auth/user-not-found') throw err;
    // Auth user already gone — proceed with Firestore-only soft delete.
  }
  await ref.update({
    status: 'disabled',
    deletedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await writeAuditLog({
    actorUid,
    action: 'user.delete',
    resourceType: 'user',
    resourceId: targetUid,
    before: { role: before['role'], status: before['status'] },
    after: { status: 'disabled' },
  });

  return { ok: true };
}

export const deleteUser = onCall(
  { region: 'us-central1', enforceAppCheck: process.env['ENFORCE_APP_CHECK'] !== 'false' },
  deleteUserHandler,
);
