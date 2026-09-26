/**
 * Same-origin guard. Browsers send `Origin` on every state-changing
 * cross-origin POST, so comparing it to the request's own host blocks
 * any third-party page that managed to obtain a Firebase ID token
 * (e.g. via OAuth flow misuse) from minting a session cookie under
 * our domain.
 *
 * We accept the request only when:
 *   - `Origin` header is missing (older browsers / Next.js server-side
 *     rewrites) AND `Sec-Fetch-Site` is missing too (legacy clients),
 *     OR
 *   - the Origin's host matches the request's Host header.
 *
 * Shared by every /api/session route that hands out or accepts a credential.
 */
export function sameOrigin(req: { headers: Headers }): boolean {
  const origin = req.headers.get('origin');
  const host = req.headers.get('host');
  if (!origin) {
    // Modern fetch always sets Origin on POST. If it's missing AND the
    // browser also didn't send Sec-Fetch-Site, this is likely a
    // server-side request (e.g. SSR) which we trust. If Sec-Fetch-Site
    // says cross-site, refuse.
    const sfs = req.headers.get('sec-fetch-site');
    return !sfs || sfs === 'same-origin';
  }
  if (!host) return false;
  try {
    const originUrl = new URL(origin);
    return originUrl.host === host;
  } catch {
    return false;
  }
}
