import { randomBytes } from 'crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { isValidCiPy, isValidRucPy, RoleSchema, DocumentTypeSchema } from '@carbid/shared-types';
import { adminAuth, adminDb } from '../lib/admin.js';
import { setUserClaims } from '../lib/claims.js';
import { writeAuditLog } from '../lib/audit.js';
import { loadAppConfig } from '../lib/config.js';
import { requireAdmin } from '../lib/errors.js';
import { FieldValue } from 'firebase-admin/firestore';
import { sendEmail, RESEND_API_KEY } from '../lib/email.js';

const InputSchema = z.object({
  role: RoleSchema,
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  documentType: DocumentTypeSchema,
  documentNumber: z.string().min(1),
  phone: z.string().optional(),
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
  const { uid: actorUid } = requireAdmin(req);

  const parsed = InputSchema.safeParse(req.data);
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Invalid input', parsed.error.flatten());
  }
  const input = parsed.data;

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

  await setUserClaims(authUser.uid, { role: input.role, status: 'active' });

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

  await sendEmail({
    to: input.email,
    subject: 'Bienvenido a CARBID',
    html: `<p>Hola ${input.firstName},</p>
    <p>Se creó tu cuenta CARBID con rol <b>${input.role}</b>.</p>
    <p>Configura tu contraseña aquí:</p>
    <p><a href="${resetLink}">Configurar contraseña</a></p>
    <p>— CARBID Subastas</p>`,
  }).catch((err) => {
    console.error('[createUser] welcome email failed', err);
  });

  return { uid: authUser.uid, resetLink };
}

export const createUser = onCall(
  { region: 'us-central1', secrets: [RESEND_API_KEY] },
  createUserHandler,
);
