export const META_PIXEL_ID = '1864069597698281';

declare global {
  interface Window {
    fbq?: FbqFn & { callMethod?: (...args: unknown[]) => void; queue?: unknown[] };
    _fbq?: unknown;
  }
}

type FbqFn = (...args: unknown[]) => void;

let injected = false;

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

/** Whether the pixel script has been injected and its first PageView sent. */
export function isMetaPixelLoaded(): boolean {
  return injected;
}

/**
 * Load the Meta Pixel.
 *
 * ONLY ever called after the visitor accepts cookies — see applyConsent() in
 * lib/legal/cookie-consent.ts. This is advertising tracking that sends page
 * visits to Meta, so firing it before consent would both ignore the reject
 * button and contradict the published cookie policy.
 *
 * Hand-written rather than pasted from Meta's minified snippet so it can be
 * read and typed. Behaviour matches: define the fbq queue shim, append the
 * loader script, then init + first PageView.
 *
 * Meta's snippet also ships a <noscript> tracking pixel. It is deliberately
 * omitted: a visitor with JavaScript disabled can't have used our consent
 * banner, so that image would track exactly the people who never agreed.
 *
 * No-ops on a credential-bearing page without marking itself loaded, so
 * arriving on a reset link first doesn't disable the pixel for the whole
 * session — the route tracker retries on the next safe navigation.
 */
export function loadMetaPixel(): void {
  if (typeof window === 'undefined' || injected) return;
  if (isCredentialBearingPath(window.location.pathname)) return;
  injected = true;

  if (!window.fbq) {
    const fbq: Window['fbq'] = function (...args: unknown[]) {
      const self = window.fbq!;
      if (self.callMethod) self.callMethod(...args);
      else self.queue!.push(args);
    } as NonNullable<Window['fbq']>;
    fbq.queue = [];
    window.fbq = fbq;
    window._fbq = window._fbq ?? fbq;

    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(script);
  }

  window.fbq?.('init', META_PIXEL_ID);
  window.fbq?.('track', 'PageView');
}

/**
 * Report a client-side route change.
 *
 * The app is a single-page router, so the pixel's own initial PageView is the
 * only one Meta would ever see without this — every subsequent navigation
 * would be invisible. No-ops when the pixel was never loaded (consent not
 * given), so it needs no consent check of its own.
 *
 * Navigating INTO a credential-bearing page is silent for the same reason
 * loadMetaPixel() refuses to start there: the URL is the secret.
 */
export function trackMetaPageView(): void {
  if (typeof window === 'undefined' || !injected) return;
  if (isCredentialBearingPath(window.location.pathname)) return;
  window.fbq?.('track', 'PageView');
}
