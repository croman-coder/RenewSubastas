'use client';
import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { httpsCallable } from 'firebase/functions';
import { fb } from '@/lib/firebase/client';
import { isCredentialBearingPath } from '@/lib/analytics/meta-pixel';
import { getSessionId } from '@/lib/analytics/traffic-session';

/** `null`/empty means "no signal" — the field must be OMITTED, not sent as
 *  an empty string. See the payload-building comment in the effect below. */
function nonEmpty(value: string | null): string | undefined {
  return value ? value : undefined;
}

/**
 * Reports every navigation to the anonymous web-traffic counter
 * (functions/src/insights/logPageView.ts — see
 * docs/superpowers/specs/2026-08-08-trafico-web-design.md for the full
 * design). Mounted once in the locale layout, next to
 * `MetaPixelRouteTracker` and inside the same `<Suspense>` boundary — same
 * shape as that component on purpose: `usePathname` + `useSearchParams`
 * re-run this effect on every SPA navigation, and `useSearchParams` is what
 * requires the Suspense boundary in the first place.
 *
 * Unlike the Meta Pixel, this has no consent gate — that is the entire point
 * of the feature (see traffic-session.ts and the design doc's "Sin cookies"
 * section), not an oversight. It has two OTHER gates instead, both
 * defense-in-depth for checks the server (`logPageViewHandler`) already
 * enforces on its own:
 *   - `isCredentialBearingPath`: never even dial out from a page whose URL
 *     holds a live credential (password-reset token, Firebase oobCode).
 *   - `getSessionId() === null`: sessionStorage is unavailable (SSR) or
 *     threw (Safari private mode, some in-app browsers) — see that
 *     function's doc comment.
 *
 * Best-effort, unconditionally: whatever the callable does — reject on App
 * Check, rate-limit, a flaky network — is swallowed. A traffic counter must
 * never surface an error to, or break the page for, someone mid-bid.
 *
 * Renders nothing.
 */
export function TrafficTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (isCredentialBearingPath(pathname)) return;

    const sessionId = getSessionId();
    if (sessionId === null) return;

    const utmSource = nonEmpty(searchParams.get('utm_source'));
    // document.referrer is a browser-level property tied to how the CURRENT
    // DOCUMENT was loaded — not to this specific client-side route change.
    // Next's router uses the History API for in-app navigation, which never
    // reloads the document, so this value stays exactly what it was when the
    // visitor's browser first navigated into the app, for the rest of the
    // tab's life. Reading and sending it on EVERY navigation (not just the
    // first) is therefore not redundant: it is what attaches the session's
    // one entry-source signal to every event in the funnel, for free, with
    // no extra state of our own to keep in sync. `utm_source` only ever
    // appears on the entry URL an ad actually links to (`?utm_source=ig`) —
    // every later in-app navigation has no query string at all, so without
    // this fallback, "¿dónde se cae?" would misreport every step after the
    // first as 'direct' for anyone who arrived via an ad, which is precisely
    // the traffic this counter exists to measure. Matches classifySource's
    // own documented precedence: utm wins when present, referrer is the
    // fallback, and the server maps both to a closed list either way —
    // nothing raw is ever stored.
    const referrer = nonEmpty(document.referrer);

    // Optional fields are added to the payload CONDITIONALLY, never set to
    // `undefined`. Verified directly against the installed
    // @firebase/functions build (see task-4-report.md): its callable
    // encoder treats an explicit `undefined` property as `null`
    // (`encode()`'s `data == null` check fires before any type check), not
    // as an absent key the way `JSON.stringify` would — so `{ utmSource:
    // undefined }` is sent over the wire as `{ "utmSource": null }`. The
    // server's zod schema uses `.optional()`, which accepts a missing key
    // but REJECTS `null` outright ("Expected string, received null"). Send
    // an explicit `undefined` here and every call without a utm_source —
    // i.e. almost all of them — would fail `invalid-argument` and be
    // swallowed by the `.catch` below: the feature would silently record
    // almost nothing. Same reasoning already applied server-side in
    // logPageView.ts, which spreads `auctionId` in conditionally instead of
    // assigning it `undefined`.
    httpsCallable(
      fb.functions,
      'logPageView',
    )({
      path: pathname,
      sessionId,
      ...(utmSource !== undefined ? { utmSource } : {}),
      ...(referrer !== undefined ? { referrer } : {}),
    }).catch(() => {
      // Best-effort: App Check failure, rate limit, network hiccup, anything
      // — none of it may ever reach the visitor or break rendering.
    });
  }, [pathname, searchParams]);

  return null;
}
