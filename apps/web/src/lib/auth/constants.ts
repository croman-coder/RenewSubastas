export const SESSION_COOKIE_NAME = '__session';
export const SESSION_TTL_MS = 5 * 24 * 60 * 60 * 1000; // 5 days

export type Role = 'admin' | 'staff' | 'finanzas' | 'buyer';

export type Audience = 'retail' | 'wholesale';

/**
 * Resolves the post-login destination for a given user.
 *
 * Admin and staff have static homes. Buyers land on a path that mirrors
 * their audience (`/retail` or `/wholesale`) so the URL bar always agrees
 * with the chip in the topbar — a wholesale account never sees `/retail`
 * in the URL and vice-versa.
 *
 * Falls back to `/retail` for legacy buyer accounts whose `audience` claim
 * hasn't been backfilled yet, matching the migration default.
 */
export function homeFor(role: Role, audience?: Audience): string {
  if (role === 'admin') return '/admin';
  if (role === 'staff') return '/staff';
  // Finance role lands directly on the sales ledger — the only surface
  // it operates (confirm/release seña).
  if (role === 'finanzas') return '/sales';
  return `/${audience ?? 'retail'}`;
}
