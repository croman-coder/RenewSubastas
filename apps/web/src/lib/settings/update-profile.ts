'use server';
import 'server-only';
import { z } from 'zod';
import { isValidCiPy, isValidRucPy } from '@carbid/shared-types';
import { adminAuth, getAdminApp } from '@/lib/firebase/admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME } from '@/lib/auth/constants';

const Input = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  documentType: z.enum(['CI', 'RUC']),
  documentNumber: z.string().min(1).max(20),
  phone: z.string().max(30).optional(),
  addressStreet: z.string().max(120).optional(),
  addressCity: z.string().max(80).optional(),
  addressPostalCode: z.string().max(20).optional(),
});

export type UpdateProfileResult = { ok: true } | { ok: false; error: string };

export async function updateProfileAction(
  input: z.infer<typeof Input>,
): Promise<UpdateProfileResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid' };
  const v = parsed.data;
  const ok =
    v.documentType === 'CI' ? isValidCiPy(v.documentNumber) : isValidRucPy(v.documentNumber);
  if (!ok) return { ok: false, error: 'documentInvalid' };

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
  if (v.addressStreet ?? v.addressCity ?? v.addressPostalCode) {
    update['profile.address'] = {
      street: v.addressStreet ?? '',
      city: v.addressCity ?? '',
      country: 'PY' as const,
      ...(v.addressPostalCode !== undefined && { postalCode: v.addressPostalCode }),
    };
  }

  await getFirestore(getAdminApp()).doc(`users/${uid}`).update(update);
  return { ok: true };
}
