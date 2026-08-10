import type { User } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { fb } from '@/lib/firebase/client';
import { postSession, type PostSessionResult } from './post-session';

/**
 * Shared tail of every password-provider sign-in: try to provision the
 * buyer account, force-refresh the ID token so it carries any custom claims
 * that call just set, then exchange it for a session cookie. Mirrors
 * google-signin-button.tsx's registerGoogleBuyer → getIdToken(true) →
 * postSession sequence for the password provider.
 *
 * Two call sites:
 *   - register-form.tsx, right after the visitor's own verification check
 *     succeeds — passes the name they typed explicitly.
 *   - login-form.tsx, on every ordinary password sign-in — passes nothing.
 *     This is the fallback for a buyer who verified their email but never
 *     made it back to the registration tab (closed it, verified on another
 *     device, came back days later): the callable derives a name from the
 *     Auth token instead. For an existing account (the overwhelmingly
 *     common case on this path) the callable no-ops and just confirms the
 *     real role, so calling it unconditionally on every login is cheap and
 *     safe — same reasoning as the Google button's unconditional call.
 *
 * registerPasswordBuyer failing here is expected and swallowed: an
 * unverified email or a non-password provider makes the callable a
 * deliberate no-op (see its own precondition check), and the existing
 * token's claims — if any — still apply below.
 *
 * Forces a token refresh BEFORE calling the callable, not just after.
 * `email_verified` is a claim baked into the ID token/JWT at mint time.
 * Both call sites first call `user.reload()` to update the *User object's*
 * `emailVerified` property from a fresh account lookup — but that call does
 * NOT refresh the cached JWT that `httpsCallable` auto-attaches to the
 * request. Without this, a buyer who verifies and immediately clicks "ya
 * verifiqué" is still carrying the token minted at sign-up time (correctly
 * `email_verified: false` then), so the callable's own precondition check
 * rejects them with `failed-precondition` even though the account is, in
 * truth, now verified. Confirmed against the emulator: omitting this
 * produces exactly that failure on the first check attempt.
 */
export async function finalizePasswordAccount(
  user: User,
  explicitName?: { firstName: string; lastName: string },
): Promise<PostSessionResult> {
  await user.getIdToken(true);
  try {
    await httpsCallable(fb.functions, 'registerPasswordBuyer')(explicitName);
  } catch {
    // Not applicable — see doc comment above.
  }
  // Refresh again to pick up the custom claims registerPasswordBuyer just
  // set (role/status/audience) — the pre-call refresh above only guaranteed
  // a current email_verified claim, not these.
  const idToken = await user.getIdToken(true);
  return postSession(idToken);
}
