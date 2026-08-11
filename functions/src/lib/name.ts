// Shared name-sanitization for identities whose display name is untrusted
// free text we don't control — an OAuth provider's profile name, or (as a
// fallback) a Firebase Auth token's `name` claim. Both let the underlying
// user pick ANY Unicode string, unlike the forms this app owns (createUser,
// the buyer self-edit form, the password registration form), which already
// restrict input to NAME_CHAR_RX at the zod layer. A crafted value like
// `Ana<img src=x onerror=...>` would otherwise land straight in
// profile.firstName and from there into every email that greets the buyer
// by name and every staff-facing panel that lists them.
const NAME_CHAR_RX = /[^\p{L}\p{M}'’\- .]/gu;

/** Strips disallowed characters and clamps length. Never throws. */
export function sanitizeNamePart(s: string, maxLen = 40): string {
  return s.replace(NAME_CHAR_RX, '').trim().slice(0, maxLen);
}

/**
 * Splits a free-text display name into {firstName, lastName}, sanitizing
 * both parts (strips disallowed characters rather than rejecting — there's
 * no form to send the user back to fix a stray emoji in their Google name).
 * Falls back to the email local-part, then a generic label, so firstName is
 * never empty (UserProfileSchema requires min(1), and placeBid/emails read
 * this field).
 *
 * The fallback goes through `sanitizeNamePart` too, not just the primary
 * value — local-parts run up to 64 chars (RFC 5321) and can contain
 * `+._-` and digits, none of which NAME_RX (createUser's admin form / the
 * buyer self-edit form / the password registration form) allows. An
 * unclamped, unsanitized fallback here would silently write a profile
 * value those forms' own `max(40)` + `NAME_RX` refuse to save, so the
 * buyer can't touch their own profile again without first fixing a field
 * they never typed into.
 */
export function deriveNameFromDisplayName(
  displayName: string | undefined,
  email: string,
): { firstName: string; lastName: string } {
  const [rawFirst = '', ...rest] = (displayName ?? '').trim().split(/\s+/);
  const firstName =
    sanitizeNamePart(rawFirst) || sanitizeNamePart(email.split('@')[0] ?? '') || 'Usuario';
  const lastName = sanitizeNamePart(rest.join(' '));
  return { firstName, lastName };
}
