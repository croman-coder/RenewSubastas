'use server';
import 'server-only';
import { z } from 'zod';
import { isValidCiPy, isValidRucPy } from '@carbid/shared-types';
import { adminAuth, getAdminApp } from '@/lib/firebase/admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME } from '@/lib/auth/constants';

// Document type covers Paraguay's standard CI / RUC plus Pasaporte for
// foreign buyers. Numeric-only with max 7 for CI / max 11 for RUC, but
// alphanumeric up to 15 for passports (Latin letters and digits, no spaces).
const Input = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  documentType: z.enum(['CI', 'RUC', 'PASSPORT']),
  documentNumber: z.string().min(1).max(15),
  // Phone is stored as a single E.164-ish string with the country prefix
  // already applied (e.g. "+595981123456"). The form is responsible for
  // assembling it from the country picker + the local digits.
  phone: z.string().max(20).optional(),
  addressStreet: z.string().max(130).optional(),
  addressDepartment: z.string().max(80).optional(),
  addressCity: z.string().max(80).optional(),
  addressBarrio: z.string().max(80).optional(),
  addressPostalCode: z
    .string()
    .regex(/^\d{4}$/, 'Código postal inválido')
    .optional()
    .or(z.literal('')),
});

export type UpdateProfileResult = { ok: true } | { ok: false; error: string };

export async function updateProfileAction(
  input: z.infer<typeof Input>,
): Promise<UpdateProfileResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid' };
  const v = parsed.data;
  const docOk = validateDocument(v.documentType, v.documentNumber);
  if (!docOk) return { ok: false, error: 'documentInvalid' };

  const sessionCookie = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) return { ok: false, error: 'unauthenticated' };
  let uid: string;
  try {
    const decoded = await adminAuth().verifySessionCookie(sessionCookie, true);
    uid = decoded.uid;
  } catch {
    return { ok: false, error: 'unauthenticated' };
  }

  const update: Record<string, unknown> = {
    'profile.firstName': v.firstName,
    'profile.lastName': v.lastName,
    'profile.documentType': v.documentType,
    'profile.documentNumber': v.documentNumber,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (v.phone !== undefined) update['profile.phone'] = v.phone;

  // Address: persist the cascading geography pieces individually so we can
  // filter later (e.g. "buyers in Asunción"). Empty fields collapse the
  // address to nothing rather than half-populated junk.
  const hasAddress = v.addressStreet || v.addressDepartment || v.addressCity || v.addressPostalCode;
  if (hasAddress) {
    update['profile.address'] = {
      street: v.addressStreet ?? '',
      department: v.addressDepartment ?? '',
      city: v.addressCity ?? '',
      barrio: v.addressBarrio ?? '',
      country: 'PY' as const,
      ...(v.addressPostalCode ? { postalCode: v.addressPostalCode } : {}),
    };
  }

  await getFirestore(getAdminApp()).doc(`users/${uid}`).update(update);
  return { ok: true };
}

function validateDocument(type: 'CI' | 'RUC' | 'PASSPORT', number: string): boolean {
  if (type === 'CI') return isValidCiPy(number);
  if (type === 'RUC') return isValidRucPy(number);
  // Passport: alphanumeric (Latin letters + digits), 5–15 chars.
  return /^[A-Za-z0-9]{5,15}$/.test(number);
}
