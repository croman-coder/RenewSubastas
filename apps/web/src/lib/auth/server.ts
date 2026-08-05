import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getFirestore } from 'firebase-admin/firestore';
import { adminAuth } from '@/lib/firebase/admin';
import { getAdminApp } from '@/lib/firebase/admin';
import { SESSION_COOKIE_NAME, homeFor, type Role } from './constants';

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
  } catch (err) {
    // `redirect()` throws a NEXT_REDIRECT control-flow error — re-throw it so
    // the disabled/no_role redirects above aren't swallowed and re-routed as
    // a generic expiry.
    if (err && typeof err === 'object' && 'digest' in err) throw err;
    // verifySessionCookie failed: the cookie is expired or revoked. Signal the
    // login page (which clears the stale __session cookie on mount) so the user
    // isn't caught in a redirect loop.
    redirect(`/${locale}/login?error=expired`);
  }
});

/**
 * Like {@link getCurrentUser} but returns `null` instead of redirecting when
 * there's no usable session. For surfaces that render for signed-out
 * visitors — today the public landing at `/[locale]` — where "not logged in"
 * is a normal state, not an error.
 *
 * Deliberately does NOT reuse getCurrentUser: that function's contract is
 * "redirect on any problem", and its redirects throw NEXT_REDIRECT, which we
 * would have to catch and swallow here. Catching control-flow errors to
 * invert a function's contract is exactly how a real auth failure ends up
 * silently rendering a page as anonymous. A disabled or role-less account
 * returns null here (rendered as a visitor) rather than being bounced to
 * /login, because a public page has somewhere sensible to put them.
 */
export const getOptionalUser = cache(async (): Promise<CurrentUser | null> => {
  const cookie = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!cookie) return null;
  try {
    const decoded = await adminAuth().verifySessionCookie(cookie, true);
    const status = (decoded as { status?: string }).status;
    const role = (decoded as { role?: Role }).role;
    if (status !== 'active' || !role) return null;

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
    if (!firstName) firstName = friendlyFromEmail(decoded.email ?? '');
    if (role === 'buyer' && !audience) audience = 'retail';
    return { uid: decoded.uid, role, email: decoded.email ?? '', firstName, audience };
  } catch {
    // Expired / revoked / malformed cookie — treat as a visitor.
    return null;
  }
});

export async function requireRole(locale: string, allowed: Role[]): Promise<CurrentUser> {
  const user = await getCurrentUser(locale);
  if (!allowed.includes(user.role)) redirect(`/${locale}${homeFor(user.role, user.audience)}`);
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
