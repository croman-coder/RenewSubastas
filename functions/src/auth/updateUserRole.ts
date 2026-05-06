import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { RoleSchema, UserStatusSchema, AudienceSchema } from '../_shared/index.js';
import { adminDb } from '../lib/admin.js';
import { setUserClaims } from '../lib/claims.js';
import { loadAppConfig } from '../lib/config.js';
import { writeAuditLog } from '../lib/audit.js';
import { requireAdmin } from '../lib/errors.js';
import { FieldValue } from 'firebase-admin/firestore';

const InputSchema = z
  .object({
    uid: z.string().min(1),
    role: RoleSchema.optional(),
    status: UserStatusSchema.optional(),
    audience: AudienceSchema.optional(),
  })
  .refine((v) => v.role !== undefined || v.status !== undefined || v.audience !== undefined, {
    message: 'role, status, or audience must be provided',
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

  // Self-protection: admin cannot disable themselves or demote themselves
  if (input.uid === actorUid) {
    if (input.status === 'disabled') {
      throw new HttpsError('permission-denied', 'Cannot disable your own account');
    }
    if (input.role !== undefined && input.role !== 'admin') {
      throw new HttpsError('permission-denied', 'Cannot demote your own admin account');
    }
  }

  // Re-enforce email domain when promoting to admin/staff
  if (input.role !== undefined && input.role !== 'buyer') {
    const config = await loadAppConfig();
    const email = before['email'] as string | undefined;
    const domain = email?.split('@')[1] ?? '';
    if (domain.toLowerCase() !== config.emails.adminStaffDomain.toLowerCase()) {
      throw new HttpsError(
        'invalid-argument',
        `Cannot promote to ${input.role}: email must use domain ${config.emails.adminStaffDomain}`,
      );
    }
  }

  // Last-admin guard: don't allow this update to leave zero active admins
  const willBeNonAdminOrInactive =
    (input.role !== undefined && input.role !== 'admin') ||
    (input.status === 'disabled' && before['role'] === 'admin');
  if (willBeNonAdminOrInactive && before['role'] === 'admin') {
    const activeAdmins = await adminDb()
      .collection('users')
      .where('role', '==', 'admin')
      .where('status', '==', 'active')
      .get();
    const otherActiveAdmins = activeAdmins.docs.filter((d) => d.id !== input.uid);
    if (otherActiveAdmins.length === 0) {
      throw new HttpsError('failed-precondition', 'Cannot remove the last active admin');
    }
  }

  // Audience is buyer-only; wipe it when role moves away from buyer.
  const beforeAudience = ((before['profile'] as Record<string, unknown> | undefined)?.[
    'audience'
  ] ?? undefined) as 'retail' | 'wholesale' | undefined;
  const nextAudience: 'retail' | 'wholesale' | undefined =
    nextRole === 'buyer' ? (input.audience ?? beforeAudience ?? 'retail') : undefined;

  await setUserClaims(input.uid, {
    role: nextRole,
    status: nextStatus,
    ...(nextAudience ? { audience: nextAudience } : {}),
  });
  await ref.update({
    ...(input.role !== undefined && { role: input.role }),
    ...(input.status !== undefined && { status: input.status }),
    ...(nextRole === 'buyer' && nextAudience
      ? { 'profile.audience': nextAudience }
      : nextRole !== 'buyer'
        ? { 'profile.audience': FieldValue.delete() }
        : {}),
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

export const updateUserRole = onCall(
  { region: 'us-central1', enforceAppCheck: process.env['ENFORCE_APP_CHECK'] === 'true' },
  updateUserRoleHandler,
);
