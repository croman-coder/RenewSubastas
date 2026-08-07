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
 */
export function loadMetaPixel(): void {
  if (typeof window === 'undefined' || injected) return;
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
 */
export function trackMetaPageView(): void {
  if (typeof window === 'undefined' || !injected) return;
  window.fbq?.('track', 'PageView');
}
