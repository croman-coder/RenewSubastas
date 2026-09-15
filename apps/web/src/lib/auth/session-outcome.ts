import type { Audience, Role } from './constants';
import type { PostSessionResult } from './post-session';

/**
 * What the login screen should do with `/api/session`'s answer. Pure, so the
 * three sign-in paths (password, Google, and the second-factor completion of
 * either) make the same decision and it is tested once.
 *
 *   enter        cookie minted → go to the dashboard
 *   enroll_mfa   the role requires a second factor and the account has none:
 *                keep the Firebase client session (enrolment needs it) and
 *                send the user to /auth/mfa/enroll
 *   reauth_mfa   the role requires it, the account HAS a factor, but this
 *                token didn't prove it. Only reachable with a stale token or
 *                a factor enrolled outside the app: sign out and ask for a
 *                fresh sign-in, where Firebase will challenge for the code.
 *   error        everything else, with the server's error key for the copy
 */
export type SessionOutcome =
  | { kind: 'enter'; role: Role; audience: Audience | null }
  | { kind: 'enroll_mfa' }
  | { kind: 'reauth_mfa' }
  | { kind: 'error'; error: string };

export function sessionOutcome(result: PostSessionResult): SessionOutcome {
  if (result.ok) return { kind: 'enter', role: result.role, audience: result.audience };
  if (result.error === 'mfa_required') {
    return result.enrolled ? { kind: 'reauth_mfa' } : { kind: 'enroll_mfa' };
  }
  return { kind: 'error', error: result.error };
}

/** Path of the enrolment page, carrying the original destination through. */
export function mfaEnrollPath(locale: string, from: string | undefined): string {
  const q = from ? `?from=${encodeURIComponent(from)}` : '';
  return `/${locale}/auth/mfa/enroll${q}`;
}
