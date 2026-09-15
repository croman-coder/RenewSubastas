'use client';
/**
 * Thin, typed wrappers over the Firebase client SDK's TOTP multi-factor API,
 * so the three screens that use it (login, Google button, enrolment) share
 * one vocabulary and one place to get the SDK's quirks right.
 *
 * TOTP only — an authenticator app (Google Authenticator, Authy, 1Password,
 * Bitwarden…). No SMS: it costs per message, depends on a phone number
 * staying with the employee, and is the weaker factor (SIM swap).
 *
 * Everything here requires the project to be on Firebase Authentication with
 * Identity Platform. On plain Firebase Auth the SDK rejects enrolment with
 * `auth/operation-not-allowed`; `describeMfaError` turns that into a message
 * a person can act on instead of a stack trace.
 */
import {
  getMultiFactorResolver,
  multiFactor,
  TotpMultiFactorGenerator,
  type Auth,
  type MultiFactorError,
  type MultiFactorInfo,
  type MultiFactorResolver,
  type TotpSecret,
  type User,
  type UserCredential,
} from 'firebase/auth';

export const MFA_REQUIRED_ERROR = 'auth/multi-factor-auth-required';
export const TOTP_FACTOR_ID = TotpMultiFactorGenerator.FACTOR_ID;
/** Label the user sees next to the factor, in the app and in the Firebase console. */
export const TOTP_DISPLAY_NAME = 'App autenticadora';
/** Issuer shown inside the authenticator app. */
export const TOTP_ISSUER = 'Renew Subastas';

/** True when a sign-in call threw because the account has a second factor. */
export function isMfaRequiredError(err: unknown): err is MultiFactorError {
  return (err as { code?: string } | null)?.code === MFA_REQUIRED_ERROR;
}

/**
 * Resolver for a sign-in that stopped at the second factor. `null` when the
 * account's enrolled factors include no TOTP one — this app never enrols
 * anything else, so that would mean a factor added outside the app (console,
 * script); the caller should say so rather than show a code box that can't
 * work.
 */
export function totpResolver(
  auth: Auth,
  err: MultiFactorError,
): { resolver: MultiFactorResolver; hint: MultiFactorInfo } | null {
  const resolver = getMultiFactorResolver(auth, err);
  const hint = resolver.hints.find((h) => h.factorId === TOTP_FACTOR_ID);
  return hint ? { resolver, hint } : null;
}

/** Completes a sign-in with the 6-digit code from the authenticator app. */
export function resolveTotpSignIn(
  resolver: MultiFactorResolver,
  hint: MultiFactorInfo,
  code: string,
): Promise<UserCredential> {
  const assertion = TotpMultiFactorGenerator.assertionForSignIn(hint.uid, normalizeCode(code));
  return resolver.resolveSignIn(assertion);
}

export interface TotpEnrollment {
  secret: TotpSecret;
  /** otpauth:// URL for the QR code. */
  otpauthUrl: string;
  /** The secret in base32, for people who type it by hand. */
  secretKey: string;
}

/**
 * Step 1 of enrolment: a fresh TOTP secret bound to this user's session.
 * Needs a RECENT sign-in — Firebase rejects it with
 * `auth/requires-recent-login` otherwise, which is why the enrolment page is
 * reached straight from the login flow.
 */
export async function startTotpEnrollment(user: User): Promise<TotpEnrollment> {
  const session = await multiFactor(user).getSession();
  const secret = await TotpMultiFactorGenerator.generateSecret(session);
  const account = user.email ?? user.uid;
  return {
    secret,
    otpauthUrl: secret.generateQrCodeUrl(account, TOTP_ISSUER),
    secretKey: secret.secretKey,
  };
}

/** Step 2: the user proves they scanned it by entering the current code. */
export function finishTotpEnrollment(
  user: User,
  secret: TotpSecret,
  code: string,
  displayName: string = TOTP_DISPLAY_NAME,
): Promise<void> {
  const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secret, normalizeCode(code));
  return multiFactor(user).enroll(assertion, displayName);
}

/** Factors currently enrolled on the account (from the client's view). */
export function enrolledFactors(user: User): MultiFactorInfo[] {
  return multiFactor(user).enrolledFactors;
}

/** Removes one factor. Also needs a recent sign-in. */
export function unenrollFactor(user: User, factor: MultiFactorInfo): Promise<void> {
  return multiFactor(user).unenroll(factor);
}

/** "123 456" → "123456"; authenticator apps often display a space. */
export function normalizeCode(code: string): string {
  return code.replace(/\D/g, '');
}

export function isValidCodeShape(code: string): boolean {
  return /^\d{6}$/.test(normalizeCode(code));
}

/**
 * Plain-Spanish message for the error codes this flow actually produces.
 * Falls back to a generic line; the raw code is kept for the console.
 */
export function describeMfaError(err: unknown): string {
  const code = (err as { code?: string } | null)?.code ?? '';
  switch (code) {
    case 'auth/invalid-verification-code':
    case 'auth/invalid-multi-factor-session':
    case 'auth/totp-challenge-timeout':
      return 'Código incorrecto o vencido. Mirá el código actual en la app y probá de nuevo.';
    case 'auth/requires-recent-login':
      return 'Por seguridad, volvé a iniciar sesión y repetí este paso enseguida.';
    case 'auth/operation-not-allowed':
    case 'auth/unsupported-first-factor':
      return 'La autenticación en dos pasos todavía no está habilitada en este proyecto de Firebase.';
    case 'auth/maximum-second-factor-count-exceeded':
      return 'Esta cuenta ya tiene el máximo de factores permitidos. Quitá uno primero.';
    case 'auth/second-factor-already-in-use':
      return 'Este autenticador ya está registrado en la cuenta.';
    case 'auth/too-many-requests':
      return 'Demasiados intentos. Esperá unos minutos y probá de nuevo.';
    case 'auth/network-request-failed':
      return 'Sin conexión. Revisá la red y probá de nuevo.';
    default:
      return 'No se pudo completar la verificación. Probá de nuevo.';
  }
}
