import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import { SESSION_COOKIE_NAME, SESSION_TTL_MS } from '@/lib/auth/constants';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
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
      uid: decoded.uid,
    });
    res.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: sessionCookie,
      maxAge: SESSION_TTL_MS / 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
    return res;
  } catch (err) {
    return NextResponse.json(
      { error: 'invalid_token', detail: String((err as Error).message ?? err) },
      { status: 401 },
    );
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({ name: SESSION_COOKIE_NAME, value: '', maxAge: 0, path: '/' });
  return res;
}
