export const META_PIXEL_ID = '1864069597698281';

declare global {
  interface Window {
    fbq?: FbqFn & {
      callMethod?: (...args: unknown[]) => void;
      queue?: unknown[];
      push?: unknown;
      loaded?: boolean;
      version?: string;
    };
    _fbq?: unknown;
  }
}

type FbqFn = (...args: unknown[]) => void;

let injected = false;
let granted = false;

/**
 * Paths whose query string carries a live, redeemable credential.
 *
 * fbevents.js reports document.location.href — full query string included —
 * with every event it sends. Firing the pixel on one of these hands Meta a
 * working password-reset token or Firebase oobCode, and anyone who can read
 * that pixel's event stream could race the real user to take over the
 * account. Masking the value isn't an option: the leak is Meta's own
 * automatic URL capture, not anything we pass it. So the pixel simply never
 * runs on these pages.
 *
 * - /auth/set-password?token=…    (reset-tokens.ts, single-use, 72h)
 * - /auth/action?…&oobCode=…      (Firebase email-action bearer code)
 *
 * This matters MORE under consent mode than it did before. The pixel used to
 * load only for visitors who accepted; now it bootstraps for everyone, so
 * without this guard every single reset-link click would reach Meta.
 *
 * Keep this list in step with any future route that puts a secret in the URL.
 */
const CREDENTIAL_BEARING_PATHS = ['/auth/action', '/auth/set-password'];

/**
 * True when `pathname` is a page whose URL holds a credential.
 *
 * Matches with or without a locale prefix (/es/auth/action) and tolerates a
 * trailing slash. Deliberately also matches nested children, so adding a
 * sub-route under one of these can't silently reopen the leak.
 */
export function isCredentialBearingPath(pathname: string): boolean {
  const clean = pathname.replace(/\/+$/, '');
  return CREDENTIAL_BEARING_PATHS.some((p) => clean.endsWith(p) || clean.includes(`${p}/`));
}

/** Whether fbevents.js has been injected and the pixel initialised. */
export function isMetaPixelLoaded(): boolean {
  return injected;
}

/** Whether the visitor has granted consent, so events are actually processed. */
export function isMetaConsentGranted(): boolean {
  return granted;
}

/**
 * Install the pixel with consent withheld.
 *
 * Runs for EVERY visitor, before any choice is made — which is a deliberate
 * change from the original consent-gated install, and the reason the wording
 * in lib/legal/company-facts.ts had to change with it.
 *
 * Meta's consent API then holds every event instead of sending it, so nothing
 * about the visit's navigation reaches Meta until grantMetaConsent() runs.
 * What Meta does learn immediately is the fbevents.js request and the config
 * fetch that `init` triggers — IP, referrer and the page's domain. That is
 * unavoidable once the script loads at all, and it is why the cookie policy
 * now says the file downloads on every visit and only the measurement waits.
 *
 * Why accept that cost: with the script absent, Meta's own tooling reports
 * "no pixel detected" and the no-code event configurator refuses to open,
 * regardless of how many events consenting visitors actually generate.
 *
 * Hand-written rather than pasted from Meta's minified snippet so it can be
 * read and typed. Meta's <noscript> tracking image stays omitted: it cannot
 * honour a consent signal at all, so under this model it would track exactly
 * the people who never agreed.
 *
 * No-ops on a credential-bearing page without marking itself loaded, so
 * landing on a reset link first doesn't disable the pixel for the rest of the
 * session — the route tracker retries on the next safe navigation.
 */
export function bootstrapMetaPixel(): void {
  if (typeof window === 'undefined' || injected) return;
  if (isCredentialBearingPath(window.location.pathname)) return;
  injected = true;

  if (!window.fbq) {
    // Every property here is part of the contract fbevents.js expects of a
    // stub, not decoration. An earlier version of this file set only `queue`,
    // on the reasoning that the rest of Meta's minified snippet was noise —
    // and it appeared to work, because `init` followed by `track` happened to
    // drain anyway. Adding `consent revoke` as the first queued call exposed
    // it: fbevents replayed that one entry and then stopped, leaving `init`
    // and everything after it stuck in the queue forever. No init, no config
    // fetch, no events, and nothing in the console to say so.
    // Queues `arguments`, not a rest array. fbevents.js replays each entry by
    // applying it as an argument list, and an Array is not an Arguments object
    // — with a plain array it drained the first entry and abandoned the rest,
    // stranding `init`. Meta's own snippet pushes `arguments` for this reason.
    const fbq: Window['fbq'] = function (this: unknown, ...args: unknown[]) {
      const self = window.fbq!;
      if (self.callMethod) self.callMethod(...args);
      // eslint-disable-next-line prefer-rest-params
      else self.queue!.push(arguments);
    } as NonNullable<Window['fbq']>;
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = '2.0';
    fbq.queue = [];
    window.fbq = fbq;
    window._fbq = window._fbq ?? fbq;

    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(script);
  }

  // Identify, then withhold — and the order is the opposite of what Meta's
  // consent-mode docs show, for a measured reason. With `revoke` first,
  // fbevents.js defers the whole queue: `init` is never processed, no config
  // is fetched, the pixel is never registered, and Meta's own tooling still
  // reports "no pixel detected" — which is the entire problem this is meant
  // to solve. Verified in the browser: the queue drained `revoke` and left
  // `init` stranded indefinitely.
  //
  // Initialising first registers the pixel (that is what the detector and the
  // event configurator look for) and costs one config request to Meta
  // carrying the pixel id and the page's domain. `init` on its own sends no
  // PageView — Meta's snippet fires that as a separate `track` call, which we
  // only make after consent. The revoke lands in the same tick, before any
  // event could be generated.
  window.fbq?.('init', META_PIXEL_ID);
  window.fbq?.('consent', 'revoke');
}

/**
 * Release the queued events and start measuring.
 *
 * Called only from applyConsent() in lib/legal/cookie-consent.ts, i.e. only
 * once the visitor has accepted. Bootstraps first if the pixel isn't installed
 * yet — accepting on a credential-bearing page is a no-op, and the route
 * tracker picks it up on the next safe navigation.
 *
 * The explicit PageView is needed because the one Meta fires on `init` was
 * suppressed by the revoke above.
 */
export function grantMetaConsent(): void {
  if (typeof window === 'undefined' || granted) return;
  if (isCredentialBearingPath(window.location.pathname)) return;
  if (!injected) bootstrapMetaPixel();
  if (!injected) return;

  granted = true;
  window.fbq?.('consent', 'grant');
  window.fbq?.('track', 'PageView');
}

/**
 * Report a client-side route change.
 *
 * The app is a single-page router, so without this the only PageView Meta
 * would ever see is the one grantMetaConsent() sends — every subsequent
 * navigation would be invisible.
 *
 * Gated on `granted`, not on `injected`: after the bootstrap the pixel exists
 * for everyone, so keying off installation would track visitors who declined.
 *
 * Navigating INTO a credential-bearing page is silent for the same reason the
 * bootstrap refuses to start there: the URL is the secret.
 */
export function trackMetaPageView(): void {
  if (typeof window === 'undefined' || !granted) return;
  if (isCredentialBearingPath(window.location.pathname)) return;
  window.fbq?.('track', 'PageView');
}
