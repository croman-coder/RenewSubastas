import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { adminAuth } from '../lib/admin.js';
import { writeAuditLog } from '../lib/audit.js';
import { requireAdmin } from '../lib/errors.js';

const InputSchema = z.object({ uid: z.string().min(1) });

export interface GeneratePasswordResetResult {
  resetLink: string;
}

export async function generatePasswordResetHandler(
  req: CallableRequest,
): Promise<GeneratePasswordResetResult> {
  const { uid: actorUid } = requireAdmin(req);
  const parsed = InputSchema.safeParse(req.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Invalid input');

  const user = await adminAuth().getUser(parsed.data.uid);
  if (!user.email) throw new HttpsError('failed-precondition', 'User has no email');

  const resetLink = await adminAuth().generatePasswordResetLink(user.email);

  await writeAuditLog({
    actorUid,
    action: 'user.password_reset_generated',
    resourceType: 'user',
    resourceId: parsed.data.uid,
  });

  return { resetLink };
}

export const generatePasswordReset = onCall(
  { region: 'us-central1' },
  generatePasswordResetHandler,
);
