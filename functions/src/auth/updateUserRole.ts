import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { RoleSchema, UserStatusSchema } from '@carbid/shared-types';
import { adminDb } from '../lib/admin.js';
import { setUserClaims } from '../lib/claims.js';
import { writeAuditLog } from '../lib/audit.js';
import { requireAdmin } from '../lib/errors.js';
import { FieldValue } from 'firebase-admin/firestore';

const InputSchema = z
  .object({
    uid: z.string().min(1),
    role: RoleSchema.optional(),
    status: UserStatusSchema.optional(),
  })
  .refine((v) => v.role !== undefined || v.status !== undefined, {
    message: 'role or status must be provided',
  });

export interface UpdateUserRoleResult {
  ok: true;
}

export async function updateUserRoleHandler(req: CallableRequest): Promise<UpdateUserRoleResult> {
  const { uid: actorUid } = requireAdmin(req);
  const parsed = InputSchema.safeParse(req.data);
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Invalid input', parsed.error.flatten());
  }
  const input = parsed.data;

  const ref = adminDb().doc(`users/${input.uid}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'User not found');
  const before = snap.data()!;

  const nextRole = (input.role ?? before['role']) as 'admin' | 'staff' | 'buyer';
  const nextStatus = (input.status ?? before['status']) as 'active' | 'disabled';

  await setUserClaims(input.uid, { role: nextRole, status: nextStatus });
  await ref.update({
    ...(input.role !== undefined && { role: input.role }),
    ...(input.status !== undefined && { status: input.status }),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await writeAuditLog({
    actorUid,
    action: 'user.update_role',
    resourceType: 'user',
    resourceId: input.uid,
    before: { role: before['role'], status: before['status'] },
    after: { role: nextRole, status: nextStatus },
  });

  return { ok: true };
}

export const updateUserRole = onCall({ region: 'us-central1' }, updateUserRoleHandler);
