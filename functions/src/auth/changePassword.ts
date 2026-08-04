import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { adminAuth, adminDb } from '../lib/admin.js';
import { writeAuditLog } from '../lib/audit.js';
import { requireAdmin } from '../lib/errors.js';
import { sendEmail, RESEND_API_KEY } from '../lib/email.js';
import { emailShell, body, badge, heading, callout, ctaButton } from '../lib/email-templates.js';
import { issuePasswordSetLink } from './reset-tokens.js';

const InputSchema = z.object({ uid: z.string().min(1) });

export interface GeneratePasswordResetResult {
  resetLink: string;
  emailed: boolean;
}

export async function generatePasswordResetHandler(
  req: CallableRequest,
): Promise<GeneratePasswordResetResult> {
  const { uid: actorUid } = requireAdmin(req);
  const parsed = InputSchema.safeParse(req.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Invalid input');

  let user;
  try {
    user = await adminAuth().getUser(parsed.data.uid);
  } catch (err) {
    if ((err as { code?: string }).code === 'auth/user-not-found') {
      throw new HttpsError('not-found', 'User not found');
    }
    throw err;
  }
  if (!user.email) throw new HttpsError('failed-precondition', 'User has no email');

  const resetLink = await issuePasswordSetLink(parsed.data.uid, user.email, 'reset');

  // Greeting name from the Firestore profile (fallback to email local-part).
  const uSnap = await adminDb().doc(`users/${parsed.data.uid}`).get();
  const firstName =
    ((uSnap.data()?.['profile'] as Record<string, unknown> | undefined)?.['firstName'] as
      | string
      | undefined) ??
    user.email.split('@')[0] ??
    '';

  // Email the link straight to the user. The admin still gets the link
  // in the response (UI shows + copies it) as a fallback channel.
  let emailed = false;
  try {
    const html = emailShell(
      body(
        badge('Restablecer contraseña', 'info') +
          heading(
            `Hola, ${firstName}`,
            'Recibimos un pedido para restablecer la contraseña de tu cuenta en <strong style="color:#0a0a0a;">Renew Subastas</strong>.',
          ) +
          callout(
            'Si no pediste esto, ignorá este correo: tu contraseña actual sigue funcionando. El enlace es personal y de un solo uso.',
            'warning',
          ) +
          ctaButton(resetLink, 'Crear nueva contraseña') +
          `<p style="margin:18px 0 0;font-size:12px;color:#a1a1aa;line-height:1.5;">Si el botón no funciona, copiá y pegá este enlace:<br><span style="color:#71717a;word-break:break-all;">${resetLink}</span></p>`,
      ),
    );
    await sendEmail({
      to: user.email,
      subject: 'Restablecé tu contraseña · Renew Subastas',
      html,
    });
    emailed = true;
  } catch (err) {
    console.error('[generatePasswordReset] email failed', err);
  }

  await writeAuditLog({
    actorUid,
    action: 'user.password_reset_generated',
    resourceType: 'user',
    resourceId: parsed.data.uid,
    after: { emailed },
  });

  return { resetLink, emailed };
}

export const generatePasswordReset = onCall(
  {
    region: 'us-central1',
    secrets: [RESEND_API_KEY],
    enforceAppCheck: process.env['ENFORCE_APP_CHECK'] !== 'false',
  },
  generatePasswordResetHandler,
);
