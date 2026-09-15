/**
 * The one rule for "does this sign-in need a second factor before it gets a
 * session cookie": the account's role is in the configured list AND the ID
 * token was NOT produced by a sign-in that completed a second factor.
 *
 * Firebase Auth has no per-role MFA. Its project-level MFA state is either
 * "users may enrol" (ENABLED) or "everyone must" (MANDATORY) — and MANDATORY
 * would put an authenticator app in front of every buyer, which is not what
 * anyone asked for. So the project stays on ENABLED and the requirement for
 * staff/admin/finanzas is imposed HERE, at the only place a server session
 * is minted (`/api/session`): no second factor, no cookie, no staff pages.
 *
 * The evidence is the `firebase.sign_in_second_factor` claim Firebase puts
 * in an ID token whenever the sign-in that produced it went through
 * `MultiFactorResolver.resolveSignIn` — `"totp"` for an authenticator app.
 * It describes THIS sign-in, not the account: an account with a factor
 * enrolled that somehow presents a token without the claim is still
 * refused, because that token did not prove the second factor.
 *
 * `requiredRoles` comes from `app_config/global.security.mfaRequiredRoles`
 * (see mfa-policy.ts) so enforcement can be switched on per role — or off
 * entirely — from Firestore, without a deploy. An empty list means the gate
 * is open for everyone, which is the deliberate default: the code ships
 * first, people enrol voluntarily, and only then does the list get filled.
 *
 * Pure and dependency-free so it is unit tested directly.
 */

export type MfaGateVerdict = 'ok' | 'mfa_required';

export interface MfaGateInput {
  /** `role` custom claim of the signed-in account. */
  role: string | null | undefined;
  /** `firebase.sign_in_second_factor` claim of the ID token, if any. */
  secondFactor: string | null | undefined;
  /** Roles that must present a second factor. Empty = nobody. */
  requiredRoles: readonly string[];
}

export function mfaGate({ role, secondFactor, requiredRoles }: MfaGateInput): MfaGateVerdict {
  if (!role || !requiredRoles.includes(role)) return 'ok';
  return typeof secondFactor === 'string' && secondFactor.length > 0 ? 'ok' : 'mfa_required';
}

/** The three internal roles. The default value to put in the config the day
 *  enforcement is switched on — buyers are never in this list. */
export const INTERNAL_ROLES = ['admin', 'staff', 'finanzas'] as const;

/**
 * Normalises whatever is stored under `security.mfaRequiredRoles` into a
 * clean list of role names. Anything that is not an array of strings — the
 * field missing, a typo'd scalar, a stray null — reads as "nobody", never as
 * "everybody": a malformed config must fail open for login, not lock the
 * whole staff out.
 */
export function parseRequiredRoles(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((r): r is string => typeof r === 'string' && r.trim().length > 0);
}
