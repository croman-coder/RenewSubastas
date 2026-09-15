import type { User } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { fb } from '@/lib/firebase/client';
import { postSession, type PostSessionResult } from './post-session';

/**
 * Shared tail of every Google sign-in — the Google twin of
 * `finalizePasswordAccount`: provision (or resolve) the account server-side,
 * force-refresh the ID token so it carries the claims that call just set,
 * then exchange it for a session cookie.
 *
 * Extracted from google-signin-button.tsx so the login form can run the
 * exact same tail after a SECOND-FACTOR completion: when Google sign-in
 * stops at `auth/multi-factor-auth-required`, the code step finishes the
 * sign-in and lands on a `User` that still needs this provisioning + cookie
 * exchange. One tail, two entry points.
 */
export type FinalizeGoogleResult = PostSessionResult & {
  /** True only when registerGoogleBuyer created the account on this call. */
  isNewAccount: boolean;
};

export async function finalizeGoogleAccount(user: User): Promise<FinalizeGoogleResult> {
  const provisioned = await httpsCallable<void, { isNew?: boolean }>(
    fb.functions,
    'registerGoogleBuyer',
  )();
  const idToken = await user.getIdToken(true);
  return { ...(await postSession(idToken)), isNewAccount: provisioned.data?.isNew === true };
}
