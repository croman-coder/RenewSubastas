import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import { SESSION_COOKIE_NAME } from '@/lib/auth/constants';
import { sameOrigin } from '@/lib/auth/same-origin';
import { mintClientToken } from '@/lib/auth/client-token';

export const runtime = 'nodejs';

/**
 * POST /api/session/client-token — devuelve un custom token de Firebase para
 * el usuario de la cookie de sesión. Lo pide `ensureClientAuth()` cuando una
 * página protegida carga sin usuario en el SDK del navegador. Ver
 * lib/auth/client-token.ts.
 */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: 'forbidden_origin' }, { status: 403 });
  }
  const result = await mintClientToken(req.cookies.get(SESSION_COOKIE_NAME)?.value, adminAuth());
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { 'Cache-Control': 'no-store' },
  });
}
