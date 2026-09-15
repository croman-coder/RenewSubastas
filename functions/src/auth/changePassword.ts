import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { adminAuth, adminDb } from '../lib/admin.js';
import { writeAuditLog } from '../lib/audit.js';
import { requireAdmin } from '../lib/errors.js';
import { DocId } from '../lib/ids.js';
import { sendEmail, RESEND_API_KEY } from '../lib/email.js';
import {
  emailShell,
  body,
  badge,
  heading,
  callout,
  ctaButton,
  esc,
} from '../lib/email-templates.js';
import { issuePasswordSetLink } from './reset-tokens.js';

const InputSchema = z.object({ uid: DocId });

export interface GeneratePasswordResetResult {
  resetLink: string;
  /** True only when Resend accepted the message. */
  emailed: boolean;
  emailStatus: 'sent' | 'failed' | 'skipped';
  /** Why it was not sent, when it wasn't (Resend's message, or no_api_key). */
  emailReason: string | null;
  emailTo: string;
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
  //
  // `sendEmail` NEVER throws — it returns { status: 'sent' | 'failed' |
  // 'skipped' } and logs the reason. Until 2026-09-15 this block did
  // `await sendEmail(...); emailed = true;`, so `emailed` was true on every
  // call, including the ones Resend rejected or the ones with no API key,
  // and the panel told the admin "enviado por email" for a mail that never
  // left. The admin had no way to know they should send the link by
  // WhatsApp instead. Now the response carries the real status and the
  // reason, and the audit log records the same.
  let emailed = false;
  let emailStatus: 'sent' | 'failed' | 'skipped' = 'failed';
  let emailReason: string | null = null;
  try {
    const html = emailShell(
      body(
        badge('Restablecer contraseña', 'info') +
          heading(
            `Hola, ${esc(firstName)}`,
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
    const sent = await sendEmail({
      to: user.email,
      subject: 'Restablecé tu contraseña · Renew Subastas',
      html,
    });
    emailStatus = sent.status;
    emailReason = sent.status === 'sent' ? null : (sent.reason ?? null);
    emailed = sent.status === 'sent';
  } catch (err) {
    // Defensive: sendEmail catches everything itself; this only guards the
    // template rendering above.
    console.error('[generatePasswordReset] email failed', err);
    emailReason = err instanceof Error ? err.message : 'unknown';
  }

  await writeAuditLog({
    actorUid,
    action: 'user.password_reset_generated',
    resourceType: 'user',
    resourceId: parsed.data.uid,
    after: { emailed, emailStatus, emailReason, to: user.email },
  });

  return { resetLink, emailed, emailStatus, emailReason, emailTo: user.email };
}

export const generatePasswordReset = onCall(
  {
    region: 'us-central1',
    secrets: [RESEND_API_KEY],
    enforceAppCheck: process.env['ENFORCE_APP_CHECK'] !== 'false',
  },
  generatePasswordResetHandler,
);
