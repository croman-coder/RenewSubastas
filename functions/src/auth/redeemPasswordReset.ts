import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { adminAuth } from '../lib/admin.js';
import { writeAuditLog } from '../lib/audit.js';
import { consumePasswordSetToken } from './reset-tokens.js';

const InputSchema = z.object({
  token: z.string().min(16).max(256),
  password: z.string().min(8).max(256),
});

export interface RedeemPasswordResetResult {
  ok: true;
  email: string;
}

// Public (unauthenticated) callable: the user setting their password is not
// signed in yet. Security rests entirely on the token — random, single-use,
// TTL-bound, hash-at-rest. App Check still applies when enforced.
export async function redeemPasswordResetHandler(
  req: CallableRequest,
): Promise<RedeemPasswordResetResult> {
  const parsed = InputSchema.safeParse(req.data);
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'La contraseña debe tener al menos 8 caracteres.');
  }

  let consumed;
  try {
    consumed = await consumePasswordSetToken(parsed.data.token);
  } catch (code) {
    if (code === 'expired') {
      throw new HttpsError('deadline-exceeded', 'El enlace expiró. Pedí uno nuevo.');
    }
    if (code === 'used') {
      throw new HttpsError('failed-precondition', 'Este enlace ya fue usado.');
    }
    throw new HttpsError('not-found', 'El enlace es inválido.');
  }

  try {
    await adminAuth().updateUser(consumed.uid, { password: parsed.data.password });
  } catch {
    throw new HttpsError('internal', 'No se pudo actualizar la contraseña.');
  }

  // Revoke any existing sessions so an old/forgotten session can't linger
  // after a password reset.
  await adminAuth()
    .revokeRefreshTokens(consumed.uid)
    .catch(() => {});

  await writeAuditLog({
    actorUid: consumed.uid,
    action: 'user.password_set',
    resourceType: 'user',
    resourceId: consumed.uid,
    after: { purpose: consumed.purpose },
  });

  return { ok: true, email: consumed.email };
}

export const redeemPasswordReset = onCall(
  {
    region: 'us-central1',
    enforceAppCheck: process.env['ENFORCE_APP_CHECK'] === 'true',
  },
  redeemPasswordResetHandler,
);
