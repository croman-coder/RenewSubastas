import type { Audience, Role } from '@/lib/auth/constants';
import { isLocale } from '@/lib/seo/site';

export type PostSessionResult =
  | { ok: true; role: Role; audience: Audience | null }
  | { ok: false; error: string };

/**
 * Exchanges a Firebase ID token for a session cookie via /api/session.
 * Shared by the password login form and the Google sign-in button so the
 * error taxonomy (account_disabled, server_misconfigured, forbidden_origin…)
 * lives in one place.
 */
export async function postSession(idToken: string): Promise<PostSessionResult> {
  const res = await fetch('/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: j.error ?? 'generic' };
  }
  const { role, audience } = (await res.json()) as { role: Role; audience: Audience | null };
  return { ok: true, role, audience };
}

/**
 * Guards the `?from=` redirect target against open-redirect / protocol-relative
 * URLs, and normalises it to a locale-less path.
 *
 * Two things, because they are the same decision. Only a same-origin absolute
 * path ("/x") is allowed — never "//host" or "/\\host", which browsers treat
 * as protocol-relative external URLs.
 *
 * And the result never carries a locale prefix. Every caller composes the
 * destination the same way — `safeRedirect(from) ?? homeFor(role)` and then
 * `/${locale}${target}` — so `target` must be locale-less for that to be
 * correct. `homeFor` already is; `?from=` was not. `public-auction-card.tsx`
 * builds `?from=/es/auctions/{id}`, which produced `/es/es/auctions/{id}` —
 * a 404 in front of anyone who reached the login page by clicking a vehicle
 * on the public landing, whatever their role. Stripping here fixes all four
 * call sites at once and keeps links already sitting in someone's tab working.
 */
const SAME_ORIGIN_PATH = /^\/(?![/\\])/;

export function safeRedirect(from: string | undefined): string | null {
  // Next types a repeated query param as string[], and the callers' prop type
  // says `string`. `?from=a&from=b` would coerce past the regex and then throw
  // on .replace — which lands differently at each call site, worst of all in
  // register-form.tsx, whose try/finally has no catch and would strand the
  // user on a permanent "entering" screen. Reject anything that isn't a string.
  if (typeof from !== 'string' || !SAME_ORIGIN_PATH.test(from)) return null;

  // "/es/auctions/x" -> "/auctions/x"; "/es" -> "/"; "/auctions/x" unchanged.
  // The lookahead admits ? and # so "/es?next=x" strips too, not just "/es/x".
  const stripped = from.replace(/^\/([^/?#]+)(?=[/?#]|$)/, (whole, seg: string) =>
    isLocale(seg) ? '' : whole,
  );

  // Removing "/es" from "/es", "/es?next=x" or "/es#top" leaves something that
  // no longer starts with a slash. Restore the root so the caller still
  // composes a valid path — and so the guard below sees a path shape.
  const normalised = stripped === '' || !stripped.startsWith('/') ? `/${stripped}` : stripped;

  // Re-test after stripping, not just before. "/es//evil.com" passes the first
  // check and becomes "//evil.com" — the exact protocol-relative shape this
  // function exists to reject. Harmless at today's call sites because each one
  // prepends `/${locale}`, but a function must not hand back the value it
  // promises to filter out.
  return SAME_ORIGIN_PATH.test(normalised) ? normalised : null;
}
