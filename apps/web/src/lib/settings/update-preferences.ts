'use server';
import 'server-only';
import { z } from 'zod';
import { cookies } from 'next/headers';
import { adminAuth, getAdminApp } from '@/lib/firebase/admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { SESSION_COOKIE_NAME } from '@/lib/auth/constants';

const Input = z.object({
  locale: z.enum(['es', 'en']),
  theme: z.enum(['light', 'dark', 'system']),
  notifications: z.object({
    outbidEmail: z.boolean(),
    auctionWonEmail: z.boolean(),
    newAuctionEmail: z.boolean(),
  }),
});

export type UpdatePreferencesResult = { ok: true } | { ok: false; error: string };

export async function updatePreferencesAction(
  input: z.infer<typeof Input>,
): Promise<UpdatePreferencesResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid' };
  const v = parsed.data;

  const cookie = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!cookie) return { ok: false, error: 'unauthenticated' };
  let uid: string;
  try {
    const decoded = await adminAuth().verifySessionCookie(cookie, true);
    uid = decoded.uid;
  } catch {
    return { ok: false, error: 'unauthenticated' };
  }

  await getFirestore(getAdminApp()).doc(`users/${uid}`).update({
    'preferences.locale': v.locale,
    'preferences.theme': v.theme,
    'preferences.notifications': v.notifications,
    updatedAt: FieldValue.serverTimestamp(),
  });

  cookies().set('NEXT_LOCALE', v.locale, {
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  });
  return { ok: true };
}
