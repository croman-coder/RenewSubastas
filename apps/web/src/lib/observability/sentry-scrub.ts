/**
 * Strips credentials out of URLs before Sentry ships them.
 *
 * Sentry attaches the full request URL — query string included — to every
 * event, and to navigation/fetch breadcrumbs. Two routes put a live,
 * redeemable secret in that query string:
 *
 * - /auth/set-password?token=…   single-use reset token, 72h TTL
 * - /auth/action?…&oobCode=…     Firebase email-action bearer code
 *
 * So any error thrown while one of those pages is open hands a working
 * account-takeover credential to a third party, where it sits in an issue
 * feed for as long as the retention window. Redact the values instead: the
 * path and the remaining params are what make an issue diagnosable, the
 * secret never was.
 *
 * Same secrets, different sink: CREDENTIAL_BEARING_PATHS in
 * src/lib/analytics/meta-pixel.ts blocks the Meta Pixel on the same routes.
 * A new route with a secret in its URL needs an entry in both places.
 */

/** Query keys whose value is a credential. Compared case-insensitively. */
const CREDENTIAL_PARAMS = ['token', 'oobcode'];

/** Replaces credential query values with a marker. Leaves other URLs alone. */
export function scrubCredentialsFromUrl<T extends string | undefined>(url: T): T {
  if (!url) return url;
  const q = url.indexOf('?');
  if (q === -1) return url;

  const params = new URLSearchParams(url.slice(q + 1));
  let touched = false;
  for (const key of Array.from(params.keys())) {
    if (CREDENTIAL_PARAMS.includes(key.toLowerCase())) {
      params.set(key, '[Filtered]');
      touched = true;
    }
  }
  if (!touched) return url;
  return `${url.slice(0, q)}?${params.toString()}` as T;
}

/** The shape of a Sentry event this touches — kept structural, not imported. */
interface UrlBearingEvent {
  request?: { url?: string };
  breadcrumbs?: Array<{ data?: Record<string, unknown> }>;
}

/**
 * Redacts every URL a Sentry event carries.
 *
 * Covers the request URL and the breadcrumb fields the SDK puts URLs in:
 * `to`/`from` on navigation crumbs, `url` on fetch/xhr crumbs.
 */
export function scrubEventUrls<T extends UrlBearingEvent>(event: T): T {
  if (event.request?.url) {
    event.request.url = scrubCredentialsFromUrl(event.request.url);
  }
  for (const crumb of event.breadcrumbs ?? []) {
    for (const field of ['to', 'from', 'url'] as const) {
      const value = crumb.data?.[field];
      if (typeof value === 'string') crumb.data![field] = scrubCredentialsFromUrl(value);
    }
  }
  return event;
}
