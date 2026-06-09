import { randomBytes } from 'crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import {
  isValidCiPy,
  isValidRucPy,
  RoleSchema,
  DocumentTypeSchema,
  AudienceSchema,
} from '../_shared/index.js';
import { adminAuth, adminDb } from '../lib/admin.js';
import { setUserClaims } from '../lib/claims.js';
import { writeAuditLog } from '../lib/audit.js';
import { loadAppConfig } from '../lib/config.js';
import { requireSignedIn } from '../lib/errors.js';
import { FieldValue } from 'firebase-admin/firestore';
import { sendEmail, RESEND_API_KEY } from '../lib/email.js';

// Names are capped at 40 chars and restricted to letters/spaces/apostrophes/
// hyphens (Unicode-aware). This is the server-side enforcement of the same
// rule applied in the admin create-user form and the buyer self-edit form,
// so the API can't be bypassed by hitting the callable directly with junk.
const NAME_RX = /^[\p{L}\p{M}'’\- .]+$/u;
const InputSchema = z.object({
  role: RoleSchema,
  email: z.string().email().max(120),
  firstName: z.string().min(1).max(40).regex(NAME_RX),
  lastName: z.string().min(1).max(40).regex(NAME_RX),
  documentType: DocumentTypeSchema,
  documentNumber: z.string().min(1).max(15),
  phone: z.string().max(20).optional(),
  /** Required when role === 'buyer'; ignored otherwise. */
  audience: AudienceSchema.optional(),
});

export interface CreateUserResult {
  uid: string;
  resetLink: string;
}

/**
 * Inner handler — exported separately so tests can call it without
 * going through the v2 onCall wrapper.
 */
export async function createUserHandler(req: CallableRequest): Promise<CreateUserResult> {
  // Admins can create any role. Staff can create buyers only (retail or
  // wholesale) so the day-to-day customer onboarding doesn't bottleneck
  // on an admin, but staff still can't manufacture more admin/staff
  // accounts and escalate the role surface.
  const { uid: actorUid, role: actorRole } = requireSignedIn(req);
  if (actorRole !== 'admin' && actorRole !== 'staff') {
    throw new HttpsError('permission-denied', 'Only admin or staff can create users');
  }

  const parsed = InputSchema.safeParse(req.data);
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Invalid input', parsed.error.flatten());
  }
  const input = parsed.data;

  // Staff can create buyers AND other staff, but never admins — only an
  // admin can mint another admin. This keeps the top privilege tier
  // closed while letting staff handle day-to-day onboarding.
  if (actorRole === 'staff' && input.role === 'admin') {
    throw new HttpsError('permission-denied', 'Staff cannot create admin accounts');
  }

  const docOk =
    input.documentType === 'CI'
      ? isValidCiPy(input.documentNumber)
      : isValidRucPy(input.documentNumber);
  if (!docOk) {
    throw new HttpsError('invalid-argument', `Invalid ${input.documentType} for Paraguay`);
  }

  const config = await loadAppConfig();
  if (input.role !== 'buyer') {
    const domain = input.email.split('@')[1] ?? '';
    if (domain.toLowerCase() !== config.emails.adminStaffDomain.toLowerCase()) {
      throw new HttpsError(
        'invalid-argument',
        `${input.role} email must use domain ${config.emails.adminStaffDomain}`,
      );
    }
  }

  const tempPassword = randomBytes(16).toString('base64url') + 'Aa1!';
  const authUser = await adminAuth().createUser({
    email: input.email,
    password: tempPassword,
    displayName: `${input.firstName} ${input.lastName}`,
    emailVerified: false,
    disabled: false,
  });

  // Audience only applies to buyers; default to retail when missing.
  const audience = input.role === 'buyer' ? (input.audience ?? 'retail') : null;

  await setUserClaims(authUser.uid, {
    role: input.role,
    status: 'active',
    ...(audience ? { audience } : {}),
  });

  await adminDb()
    .doc(`users/${authUser.uid}`)
    .set({
      uid: authUser.uid,
      role: input.role,
      email: input.email,
      status: 'active',
      profile: {
        firstName: input.firstName,
        lastName: input.lastName,
        documentType: input.documentType,
        documentNumber: input.documentNumber,
        ...(input.phone !== undefined && { phone: input.phone }),
        ...(audience ? { audience } : {}),
      },
      preferences: {
        locale: 'es',
        theme: 'system',
        notifications: {
          outbidEmail: true,
          auctionWonEmail: true,
          newAuctionEmail: false,
        },
      },
      createdBy: actorUid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

  await writeAuditLog({
    actorUid,
    action: 'user.create',
    resourceType: 'user',
    resourceId: authUser.uid,
    after: { role: input.role, email: input.email, status: 'active' },
  });

  const resetLink = await adminAuth().generatePasswordResetLink(input.email);

  // Friendly account-type label for the email body.
  const kindLabel =
    input.role === 'admin'
      ? 'Administrador'
      : input.role === 'staff'
        ? 'Staff'
        : input.audience === 'wholesale'
          ? 'Wholesale (mayorista)'
          : 'Retail (público general)';

  const LOGO = 'https://renewsubastas.netlify.app/brand/renew-wordmark-black.png';
  const welcomeHtml = `
  <div style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
      <div style="background:#fff;border:1px solid #e4e4e7;border-radius:16px;overflow:hidden;">
        <div style="padding:28px 32px 0;">
          <img src="${LOGO}" alt="Renew Subastas" height="26" style="display:block;height:26px;width:auto;" />
        </div>
        <div style="padding:22px 32px 8px;">
          <div style="display:inline-block;background:#f5f5f5;color:#0f0f0f;font-size:11px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;padding:4px 10px;border-radius:999px;">
            Cuenta creada
          </div>
          <h1 style="margin:14px 0 4px;font-size:26px;color:#0f0f0f;font-weight:800;line-height:1.2;">
            ¡Bienvenido, ${input.firstName}!
          </h1>
          <p style="margin:0 0 18px;font-size:15px;line-height:1.55;color:#52525b;">
            Tu cuenta en <strong style="color:#0f0f0f;">Renew Subastas</strong> está lista.
            Tipo de cuenta: <strong style="color:#0f0f0f;">${kindLabel}</strong>.
          </p>

          <div style="background:#f5f5f5;border-radius:12px;padding:16px 18px;margin:0 0 18px;">
            <p style="margin:0 0 4px;font-size:13px;color:#52525b;">
              Para entrar, primero creá tu contraseña con el botón de abajo.
              El enlace es personal — no lo compartas.
            </p>
          </div>

          <a href="${resetLink}" style="display:inline-block;background:#0f0f0f;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 24px;border-radius:10px;">
            Crear mi contraseña
          </a>

          <p style="margin:18px 0 0;font-size:12px;color:#a1a1aa;line-height:1.5;">
            Si el botón no funciona, copiá y pegá este enlace en tu navegador:<br>
            <span style="color:#71717a;word-break:break-all;">${resetLink}</span>
          </p>
        </div>
        <div style="padding:20px 32px 28px;border-top:1px solid #f0f0f0;margin-top:8px;">
          <p style="margin:0;font-size:11px;color:#a1a1aa;">
            Renew Subastas · Santa Rosa Automotores · Paraguay
          </p>
        </div>
      </div>
    </div>
  </div>`;

  await sendEmail({
    to: input.email,
    subject: '¡Bienvenido a Renew Subastas! Creá tu contraseña',
    html: welcomeHtml,
  }).catch((err) => {
    console.error('[createUser] welcome email failed', err);
  });

  return { uid: authUser.uid, resetLink };
}

export const createUser = onCall(
  {
    region: 'us-central1',
    secrets: [RESEND_API_KEY],
    enforceAppCheck: process.env['ENFORCE_APP_CHECK'] === 'true',
  },
  createUserHandler,
);
