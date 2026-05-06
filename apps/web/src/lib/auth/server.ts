import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getFirestore } from 'firebase-admin/firestore';
import { adminAuth } from '@/lib/firebase/admin';
import { getAdminApp } from '@/lib/firebase/admin';
import { SESSION_COOKIE_NAME, ROLE_HOME, type Role } from './constants';

export interface CurrentUser {
  uid: string;
  role: Role;
  email: string;
  /**
   * Friendly first name. Pulled from the user's Firestore profile when
   * available, or derived from the email local-part as a fallback so the UI
   * always has something nicer than the full email to display.
   */
  firstName: string;
  /**
   * Buyer-only catalog segment. Defaults to 'retail' for legacy buyers that
   * predate the audience split. Always undefined for admin/staff.
   */
  audience: 'retail' | 'wholesale' | undefined;
}

/**
 * React.cache() memoises this for the lifetime of a single render so multiple
 * components in the same request (layout + page + nested server components)
 * share one Firestore read + one verifySessionCookie call instead of N. Cache
 * is per-request, so it doesn't cross users.
 */
export const getCurrentUser = cache(async (locale: string): Promise<CurrentUser> => {
  const cookie = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!cookie) redirect(`/${locale}/login`);
  try {
    const decoded = await adminAuth().verifySessionCookie(cookie, true);
    const status = (decoded as { status?: string }).status;
    if (status !== 'active') redirect(`/${locale}/login?error=disabled`);
    const role = (decoded as { role?: Role }).role;
    if (!role) redirect(`/${locale}/login?error=no_role`);
    const email = decoded.email ?? '';
    // Best-effort friendly name lookup. The user document stores name fields
    // under a nested `profile` map (createUser, bootstrap-admin both do
    // `profile: { firstName, lastName, ... }`), so we read profile.firstName,
    // not firstName at the root. Falls back to the email local-part if the
    // profile fetch errors out so the topbar always has something to show.
    let firstName = '';
    let audience: 'retail' | 'wholesale' | undefined;
    try {
      const snap = await getFirestore(getAdminApp()).doc(`users/${decoded.uid}`).get();
      const data = snap.data() ?? {};
      const profile = (data['profile'] ?? {}) as Record<string, unknown>;
      firstName =
        ((profile['firstName'] as string | undefined) ?? (data['firstName'] as string | undefined))
          ?.toString()
          .trim() ?? '';
      if (role === 'buyer') {
        audience =
          (profile['audience'] as 'retail' | 'wholesale' | undefined) ??
          (decoded as { audience?: 'retail' | 'wholesale' }).audience ??
          'retail';
      }
    } catch {
      /* swallow — fallback below */
    }
    if (!firstName) firstName = friendlyFromEmail(email);
    if (role === 'buyer' && !audience) audience = 'retail';
    return { uid: decoded.uid, role, email, firstName, audience };
  } catch {
    redirect(`/${locale}/login`);
  }
});

export async function requireRole(locale: string, allowed: Role[]): Promise<CurrentUser> {
  const user = await getCurrentUser(locale);
  if (!allowed.includes(user.role)) redirect(`/${locale}${ROLE_HOME[user.role]}`);
  return user;
}

function friendlyFromEmail(email: string): string {
  const local = email.split('@')[0] ?? '';
  if (!local) return 'Usuario';
  // Strip digits and trailing punctuation, take first segment of dot/underscore
  // separated handles ("juan.perez" -> "juan", "rey_asocia" -> "rey").
  const first = local.split(/[._-]/)[0]?.replace(/\d+$/, '') ?? local;
  if (!first) return 'Usuario';
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}
