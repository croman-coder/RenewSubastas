import { SITE_URL } from '../lib/email-templates.js';

/**
 * Rewrites a Firebase-generated email-action link (password reset, email
 * verification) so it points at our own branded, Spanish handler page instead
 * of the default firebaseapp.com/__/auth/action screen.
 *
 * Firebase's `generatePasswordResetLink` returns a URL like
 *   https://<project>.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=XYZ&apiKey=...&lang=en
 * We keep the meaningful query params (mode, oobCode, apiKey, continueUrl) and
 * swap the origin + path to /es/auth/action. The apiKey is required by the
 * Firebase client SDK calls (verifyPasswordResetCode / confirmPasswordReset)
 * our page makes, so it's preserved.
 *
 * If parsing fails for any reason, the original link is returned unchanged so
 * the email is never broken.
 */
export function brandActionLink(firebaseLink: string, locale = 'es'): string {
  try {
    const src = new URL(firebaseLink);
    const dest = new URL(`${SITE_URL}/${locale}/auth/action`);
    for (const key of ['mode', 'oobCode', 'apiKey', 'continueUrl', 'tenantId']) {
      const v = src.searchParams.get(key);
      if (v) dest.searchParams.set(key, v);
    }
    dest.searchParams.set('lang', locale);
    return dest.toString();
  } catch {
    return firebaseLink;
  }
}
