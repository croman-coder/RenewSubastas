/**
 * Per-tab session id for the anonymous web-traffic counter
 * (functions/src/insights/logPageView.ts).
 *
 * Deliberately `sessionStorage`, never a cookie or `localStorage`. That is
 * the entire privacy posture of this feature: because the id isn't a cookie
 * and doesn't outlive the tab, it isn't a tracking identifier under the
 * cookie-consent regime this app already implements (see
 * lib/legal/cookie-consent.ts) — so it is never gated behind that banner and
 * counts every visitor, including whoever rejects it. See
 * docs/superpowers/specs/2026-08-08-trafico-web-design.md, "Sin cookies,
 * identidad por sesión de navegador", for the full reasoning: a counter that
 * only measures consenting visitors undercounts exactly the ad traffic it
 * exists to measure. If a future change wants this id to survive a reload in
 * a new tab, or survive the tab closing, that is a DIFFERENT, cookie-consent
 * decision — don't reach for `localStorage` or a cookie here to get it
 * without re-opening that conversation first.
 */
const SESSION_STORAGE_KEY = 'renew:traffic:sessionId';

/**
 * Returns this tab's session id, minting one with `crypto.randomUUID()` on
 * first call and reusing it on every call after, for as long as the tab
 * (not the browser, not the visitor) stays open.
 *
 * Returns `null` — never throws, never falls back to a fresh disposable id
 * — in two situations:
 *   - No `window` (server-side render; this module can be imported during
 *     SSR even though it only ever does anything useful in the browser).
 *   - `sessionStorage` throws. Not hypothetical: Safari in private browsing
 *     mode, and some embedded/in-app browsers (e.g. inside Instagram's own
 *     in-app browser — directly relevant, since that's where this app's ad
 *     traffic lands), throw a SecurityError on the PROPERTY ACCESS
 *     `window.sessionStorage` itself, not only on the `getItem`/`setItem`
 *     calls made on it. That's why the property read sits inside the `try`
 *     below instead of just the two method calls.
 *
 * `traffic-tracker.tsx` treats `null` as "don't report this page view".
 * Silently losing a few visitors on unusual browsers is an accepted cost;
 * a traffic counter that can throw and break a page is not.
 *
 * `crypto.randomUUID()`'s output — 36 characters, lowercase hex and hyphens,
 * e.g. "a1b2c3d4-e5f6-47a8-9b0c-d1e2f3a4b5c6" — satisfies `DocId`
 * (`^[A-Za-z0-9_-]{1,64}$`, functions/src/lib/ids.ts) with no transformation
 * needed. Verified directly (see traffic-session.test.ts and task-4-report.md)
 * rather than assumed: the server interpolates this value into a Firestore
 * doc path (`rate_limits/pageview_${sessionId}`) and stores it as a field on
 * every `page_views` doc, so a mismatch here would fail EVERY call with
 * `invalid-argument` — and the caller of this function swallows that error
 * (best-effort, by design), so the whole feature would silently record
 * nothing rather than fail loudly.
 */
export function getSessionId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, created);
    return created;
  } catch {
    return null;
  }
}
