import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import { SESSION_COOKIE_NAME, SESSION_TTL_MS } from '@/lib/auth/constants';

export const runtime = 'nodejs';

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
 */
function sameOrigin(req: NextRequest): boolean {
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

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: 'forbidden_origin' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const idToken = (body as { idToken?: unknown })?.idToken;
  if (typeof idToken !== 'string' || idToken.length === 0) {
    return NextResponse.json({ error: 'missing_id_token' }, { status: 400 });
  }

  try {
    const decoded = await adminAuth().verifyIdToken(idToken, true);
    if ((decoded as { status?: string }).status !== 'active') {
      return NextResponse.json({ error: 'account_disabled' }, { status: 403 });
    }
    const sessionCookie = await adminAuth().createSessionCookie(idToken, {
      expiresIn: SESSION_TTL_MS,
    });

    const res = NextResponse.json({
      ok: true,
      role: (decoded as { role?: string }).role ?? null,
      // Echoes the audience claim so the login form can route to the
      // matching dashboard (/retail or /wholesale) without needing a
      // second round-trip to read it from Firestore.
      audience: (decoded as { audience?: 'retail' | 'wholesale' }).audience ?? null,
      uid: decoded.uid,
    });
    res.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: sessionCookie,
      maxAge: SESSION_TTL_MS / 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      // `strict` instead of `lax`: a session cookie should never be
      // attached to top-level navigations from external sites. The
      // login flow always runs same-origin so we lose nothing.
      sameSite: 'strict',
      path: '/',
    });
    return res;
  } catch (err) {
    // Log server-side for ops; never leak Firebase error details to the client.
    console.error('[session POST] invalid token', err);
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  // Mirror POST attributes so CDNs and strict cookie parsers correctly invalidate.
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    maxAge: 0,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  });
  return res;
}
