/**
 * Pure classification rules for the anonymous web-traffic counter.
 *
 * Everything in this file is deterministic and side-effect free: no
 * Firestore, no network, no clock reads, no imports from firebase-admin.
 * The callable that actually writes `page_views` docs (a separate task)
 * owns all the I/O; this module owns the one decision that matters most —
 * what is allowed to become a recorded value — so that decision can be
 * tested in complete isolation and a hostile or buggy client can never talk
 * the callable into recording something it shouldn't.
 */

/** Where a path sits in the funnel this counter exists to measure. */
export type PathKind = 'home' | 'catalog' | 'detail' | 'login' | 'other';

/** Closed set of traffic sources. Never extend this with a client-supplied string. */
export type Source = 'ig' | 'fb' | 'google' | 'direct' | 'other';

// ---------------------------------------------------------------------------
// Credential-bearing paths
// ---------------------------------------------------------------------------

/**
 * Paths whose query string carries a live, redeemable credential.
 *
 * This is a second copy of `CREDENTIAL_BEARING_PATHS` /
 * `isCredentialBearingPath` from apps/web/src/lib/analytics/meta-pixel.ts.
 * That file lives in the `apps/web` workspace package and cannot be
 * imported from `functions/` — separate pnpm workspaces don't cross — so
 * the logic is duplicated by hand instead of shared. This comment and the
 * one above `isCredentialBearingPath` in meta-pixel.ts each name the other;
 * if one changes (a new credential-bearing route, say), go find the other.
 *
 * Background, for whoever finds only this copy first: fbevents.js reports
 * the full URL — query string included — with every event it sends. Firing
 * anything on one of these pages that captures the current URL hands a
 * working password-reset token or Firebase oobCode to whoever can read that
 * stream. This project already shipped exactly that bug once, via the Meta
 * Pixel; see meta-pixel.ts for the full incident writeup. This module
 * exists to make sure the page-view counter can't become the second copy of
 * the same mistake.
 */
const CREDENTIAL_BEARING_PATHS = ['/auth/action', '/auth/set-password'];

/**
 * True when `pathname` is a page whose URL holds a credential.
 *
 * Byte-for-byte the same logic as the copy in
 * apps/web/src/lib/analytics/meta-pixel.ts — matches with or without a
 * locale prefix (/es/auth/action), tolerates a trailing slash, and
 * deliberately also matches nested children, so a future sub-route under
 * one of these can't silently reopen the leak. Keep this function identical
 * to that one; put any new behaviour in `classifyPath` below instead of
 * here, so the two stay diffable against each other.
 */
export function isCredentialBearingPath(pathname: string): boolean {
  const clean = pathname.replace(/\/+$/, '');
  return CREDENTIAL_BEARING_PATHS.some((p) => clean.endsWith(p) || clean.includes(`${p}/`));
}

/**
 * Thrown by `classifyPath` when handed a credential-bearing path.
 *
 * `PathKind` deliberately has no member for "reject this" — the type is
 * fixed to exactly `'home' | 'catalog' | 'detail' | 'login' | 'other'`.
 * Adding a sixth member, or quietly falling back to 'other', would let a
 * `/auth/set-password?token=…` visit get written to `page_views` with a
 * category attached, which is precisely the leak this module exists to
 * prevent. Throwing means a caller cannot forget to handle this: an
 * uncaught exception fails the request loudly and visibly (Cloud Functions
 * turns it into an error response and logs it), instead of a
 * wrong-but-valid-looking `PathKind` being silently recorded as if nothing
 * were wrong. The callable that wraps this function (a later task) must
 * treat this as a hard rejection of the write — it must not add a
 * catch-everything handler that maps it to 'other' and logs anyway.
 */
export class CredentialBearingPathError extends Error {
  constructor(pathname: string) {
    super(`classifyPath: refusing to classify a credential-bearing path: ${pathname}`);
    this.name = 'CredentialBearingPathError';
  }
}

// ---------------------------------------------------------------------------
// classifyPath
// ---------------------------------------------------------------------------

/**
 * Locales the app serves (apps/web/src/i18n.ts `LOCALES`). Kept in sync by
 * hand for the same cross-workspace reason as CREDENTIAL_BEARING_PATHS
 * above.
 */
const LOCALES = new Set(['es', 'en']);

/** Strips a leading `?query` and/or `#hash`, leaving a bare pathname. */
function stripQueryAndHash(path: string): string {
  const cut = path.search(/[?#]/);
  return cut === -1 ? path : path.slice(0, cut);
}

/** Splits a pathname into segments, dropping a leading locale segment if present. */
function routeSegments(pathname: string): string[] {
  const segments = pathname.split('/').filter(Boolean);
  const [first, ...rest] = segments;
  if (first !== undefined && LOCALES.has(first)) {
    return rest;
  }
  return segments;
}

/**
 * Classifies a pathname into the funnel stage it represents.
 *
 * Expects a bare pathname — `window.location.pathname`, never
 * `location.href` or anything else carrying a query string. As defense in
 * depth against exactly that mistake (the class of bug
 * CREDENTIAL_BEARING_PATHS exists to prevent), a `?query` or `#hash` suffix
 * is stripped before the credential check runs and before it can appear in
 * a thrown error's message, so a caller that accidentally passes the full
 * href is still caught rather than silently missed or logged.
 *
 * Tolerates a locale prefix (`/es/auctions`) and a trailing slash. Throws
 * `CredentialBearingPathError` — never returns a value — for
 * `/auth/set-password` and `/auth/action`, including nested children and
 * with or without a locale prefix; see that class for why a throw and not a
 * sentinel.
 *
 * Route mapping reflects the real app (apps/web/src/app/[locale]/), not
 * assumed paths:
 *   - `/` or `/{locale}`                -> 'home'
 *   - `/{locale}/auctions`              -> 'catalog'   ((protected)/auctions)
 *   - `/{locale}/auctions/{id}`         -> 'detail'    ((protected)/auctions/[id])
 *   - `/{locale}/login`                 -> 'login'     ((auth)/login)
 *   - anything else (terminos, privacidad, cookies, staff/*, admin/*, …) -> 'other'
 *
 * Note: there is no `/registro` route anywhere in the app today (confirmed
 * by grep and by middleware.ts's KNOWN_SEGMENTS allowlist, which 404s any
 * unrecognized first segment) even though it's listed as a 'login' example
 * elsewhere. It classifies as 'other' here; see task-1-report.md.
 */
export function classifyPath(pathname: string): PathKind {
  const bare = stripQueryAndHash(pathname);
  if (isCredentialBearingPath(bare)) {
    throw new CredentialBearingPathError(bare);
  }

  const [first, second] = routeSegments(bare);
  if (first === undefined) return 'home';
  if (first === 'login') return 'login';
  if (first === 'auctions') return second === undefined ? 'catalog' : 'detail';
  return 'other';
}

// ---------------------------------------------------------------------------
// classifySource
// ---------------------------------------------------------------------------

const IG_UTM_VALUES = new Set(['ig', 'instagram']);
const FB_UTM_VALUES = new Set(['fb', 'facebook']);
const GOOGLE_UTM_VALUES = new Set(['google']);

/**
 * Classifies where a visit came from, from a `utm_source` query param
 * and/or `document.referrer`.
 *
 * Compares against a closed list and always falls back to `'other'`.
 * `utm_source` is attacker-controlled — it's a query param anyone can set
 * to anything — so no matter what the client sends, only one of the five
 * `Source` values below is ever returned. The raw string itself can never
 * reach a caller, let alone get written to Firestore; the 200-char-garbage
 * test in the test file exists to prove exactly that.
 *
 * `utm_source` wins when present, matching how the ad links are actually
 * built (`?utm_source=ig`). `referrer` is only consulted as a fallback for
 * traffic with no utm param at all, e.g. an organic Google search result.
 * A referrer that IS present but doesn't match anything recognized is
 * `'other'`, not `'direct'` — `'direct'` specifically means no signal at
 * all (typed URL, bookmark), which is a different, meaningful thing to know
 * from "came from somewhere we don't classify".
 */
export function classifySource(
  utmSource: string | null | undefined,
  referrer: string | null | undefined,
): Source {
  const utm = (utmSource ?? '').trim().toLowerCase();
  if (utm) {
    if (IG_UTM_VALUES.has(utm)) return 'ig';
    if (FB_UTM_VALUES.has(utm)) return 'fb';
    if (GOOGLE_UTM_VALUES.has(utm)) return 'google';
    return 'other';
  }

  const ref = (referrer ?? '').trim();
  if (!ref) return 'direct';

  let host: string;
  try {
    host = new URL(ref).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return 'other'; // Not a parseable URL. Still just 'other' — never thrown, never stored raw.
  }

  // Exact host or a true subdomain only — `endsWith('google.com')` would also match
  // an attacker-registered `notgoogle.com` or `reallygoogle.com`, silently crediting
  // the wrong source. Every branch below needs the `.` boundary, not just `fb.com`.
  if (host === 'google.com' || host.endsWith('.google.com')) return 'google';
  if (host === 'instagram.com' || host.endsWith('.instagram.com')) return 'ig';
  if (host === 'facebook.com' || host.endsWith('.facebook.com')) return 'fb';
  if (host === 'fb.com' || host.endsWith('.fb.com')) return 'fb';
  return 'other';
}

// ---------------------------------------------------------------------------
// isBotUserAgent
// ---------------------------------------------------------------------------

/**
 * Best-effort substrings for known bots, crawlers, and scripted clients,
 * matched case-insensitively against the whole User-Agent string. Not
 * exhaustive by design — per the design doc this is a lightweight
 * server-side filter whose false negatives get cleaned up statistically,
 * not a security boundary.
 */
const BOT_UA_SIGNATURES = [
  'bot', // catches googlebot, bingbot, AhrefsBot, SemrushBot, and most well-behaved crawlers
  'spider',
  'crawler',
  'slurp', // Yahoo
  'ahrefs',
  'semrush',
  'curl',
  'wget',
  'headless', // HeadlessChrome (Puppeteer/Playwright)
  'python-requests',
  'facebookexternalhit', // Meta's own link-preview fetcher
];

/**
 * True when `userAgent` looks like a known bot/crawler/scripted client
 * rather than a real browser.
 *
 * A missing or empty value returns `false`: it's unusual for a genuine page
 * load, but absence of a signal isn't the same as a positive match, and
 * this function should only say yes when it recognizes something specific.
 */
export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  const ua = (userAgent ?? '').toLowerCase();
  if (!ua) return false;
  return BOT_UA_SIGNATURES.some((signature) => ua.includes(signature));
}
