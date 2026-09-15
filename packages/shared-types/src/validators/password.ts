import { z } from 'zod';

/**
 * The one password rule for Renew Subastas: at least 10 characters, one
 * lowercase letter, one digit.
 *
 * It is enforced in three places that MUST agree, or a user is told one
 * thing and rejected by another:
 *
 *   1. Firebase Auth's project password policy (Console → Authentication →
 *      Settings, or `identitytoolkit.googleapis.com/admin/v2/.../config`,
 *      field `passwordPolicyConfig`): minPasswordLength 10,
 *      containsLowercaseCharacter, containsNumericCharacter. Firebase applies
 *      it to every password set through the CLIENT SDK (sign-up, change) —
 *      that is the gate a crafted request can't skip.
 *   2. The web forms (register, change password), through this schema, so
 *      the user sees the rule before Firebase says no.
 *   3. `functions/src/auth/redeemPasswordReset.ts`, which sets passwords via
 *      the Admin SDK. The Admin SDK is NOT subject to the Firebase policy, so
 *      that handler carries its own explicit copy of this rule (functions is a
 *      separate pnpm workspace and cannot import this package — the same
 *      cross-workspace constraint documented in functions/src/_shared/).
 *
 * Why lowercase and not "any letter": Firebase's policy has no "any letter"
 * option, only lowercase / uppercase / numeric / non-alphanumeric. The app
 * used to ask for "a letter"; an all-caps password would then pass the form
 * and fail Firebase. Lowercase is what everyone types anyway.
 *
 * Before 2026-09-15 the three places disagreed: register 10+letter+number,
 * change-password 8, reset-by-token 8.
 */
export const PASSWORD_MIN_LEN = 10;

export const PASSWORD_RULES = {
  minLength: PASSWORD_MIN_LEN,
  lowercase: /[a-z]/,
  digit: /[0-9]/,
} as const;

/** Machine-readable reasons, for forms that render their own copy. */
export type PasswordIssue = 'too_short' | 'no_lowercase' | 'no_digit';

/** Every rule the password breaks, in display order. Empty = acceptable. */
export function passwordIssues(value: string): PasswordIssue[] {
  const issues: PasswordIssue[] = [];
  if (value.length < PASSWORD_RULES.minLength) issues.push('too_short');
  if (!PASSWORD_RULES.lowercase.test(value)) issues.push('no_lowercase');
  if (!PASSWORD_RULES.digit.test(value)) issues.push('no_digit');
  return issues;
}

export const PASSWORD_ISSUE_MESSAGE_ES: Record<PasswordIssue, string> = {
  too_short: `Mínimo ${PASSWORD_MIN_LEN} caracteres`,
  no_lowercase: 'Incluí al menos una letra minúscula',
  no_digit: 'Incluí al menos un número',
};

/** Plain-Spanish one-liner for hints and error toasts. */
export const PASSWORD_HINT_ES = `Mínimo ${PASSWORD_MIN_LEN} caracteres, con al menos una letra minúscula y un número.`;

/**
 * Zod schema with the first broken rule as the message (Spanish). The
 * `.max` is Firebase's own hard limit on password length, stated here so a
 * pasted essay fails locally instead of with an opaque server error.
 */
export const PasswordSchema = z
  .string()
  .max(4096, 'Contraseña demasiado larga')
  .superRefine((v, ctx) => {
    const first = passwordIssues(v)[0];
    if (first)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: PASSWORD_ISSUE_MESSAGE_ES[first] });
  });

/**
 * Firebase Auth error code returned by the client SDK when the project
 * password policy rejects a password. Forms should map it to
 * `PASSWORD_HINT_ES`; the SDK's own message is English and lists the rules
 * in a format nobody should have to read.
 */
export const FIREBASE_PASSWORD_POLICY_ERROR = 'auth/password-does-not-meet-requirements';
