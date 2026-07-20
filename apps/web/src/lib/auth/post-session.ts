import type { Audience, Role } from '@/lib/auth/constants';

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
 * URLs. Only a same-origin absolute path ("/x") is allowed — never "//host"
 * or "/\\host" (which browsers treat as protocol-relative external URLs).
 * Returns the safe path, or null to fall back to the role's default home.
 */
export function safeRedirect(from: string | undefined): string | null {
  return from && /^\/(?![/\\])/.test(from) ? from : null;
}
