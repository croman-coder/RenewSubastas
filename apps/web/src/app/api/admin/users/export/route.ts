import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import { SESSION_COOKIE_NAME } from '@/lib/auth/constants';
import { EXPORT_MAX_USERS, listAllUsers } from '@/lib/admin/list-users';
import { isUsersKind, isUsersStatus } from '@/lib/admin/users-filter';
import {
  USERS_EXPORT_COLUMNS,
  userExportRows,
  usersExportFilename,
  usersExportSubtitle,
  type UsersExportFormat,
} from '@/lib/admin/users-export';
import { buildXlsx } from '@/lib/export/xlsx';
import { buildPdfTable } from '@/lib/export/pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CONTENT_TYPES: Record<UsersExportFormat, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

/**
 * Downloads the `/admin/users` list as a spreadsheet or a PDF.
 *
 * This lives under `/api` rather than reusing the page's data because a file
 * download needs its own response headers. That also puts it outside the
 * `(protected)/admin` layout, so the admin role gate is re-applied here by
 * hand — a route handler inherits nothing from the page tree.
 *
 * No CSRF check: this is a read-only GET, and the session cookie is
 * `sameSite: 'strict'` (see `/api/session`), so a cross-site request never
 * carries credentials in the first place.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const cookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!cookie) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  try {
    const decoded = await adminAuth().verifySessionCookie(cookie, true);
    const claims = decoded as { role?: string; status?: string };
    if (claims.status !== 'active' || claims.role !== 'admin') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: 'invalid_session' }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const format = params.get('format');
  if (format !== 'xlsx' && format !== 'pdf') {
    return NextResponse.json({ error: 'invalid_format' }, { status: 400 });
  }
  // Unknown filter values are dropped rather than rejected, matching the list
  // page: a stale bookmark exports everything instead of erroring.
  const kindParam = params.get('kind') ?? undefined;
  const statusParam = params.get('status') ?? undefined;
  const kind = isUsersKind(kindParam) ? kindParam : undefined;
  const status = isUsersStatus(statusParam) ? statusParam : undefined;

  try {
    // No `cursor` is accepted on purpose: an export covers the whole filtered
    // set, never the page the operator happens to be looking at.
    const items = await listAllUsers({ ...(kind && { kind }), ...(status && { status }) });
    const rows = userExportRows(items);
    const now = new Date();

    const body =
      format === 'xlsx'
        ? buildXlsx({
            sheetName: 'Usuarios',
            columns: USERS_EXPORT_COLUMNS.map((c) => ({ header: c.header, width: c.xlsxWidth })),
            rows,
          })
        : buildPdfTable({
            title: 'Usuarios',
            subtitle: usersExportSubtitle({
              count: items.length,
              kind,
              status,
              // A filtered set of exactly EXPORT_MAX_USERS reads as truncated
              // when it is merely full. Erring toward the warning is the safe
              // direction for a list someone is about to act on.
              truncated: items.length >= EXPORT_MAX_USERS,
              now,
            }),
            columns: USERS_EXPORT_COLUMNS.map((c) => ({ header: c.header, width: c.pdfWidth })),
            rows,
            pageLabel: (page, pageCount) => `Página ${page} de ${pageCount}`,
          });

    // `body` es un Buffer de Node y BodyInit no lo acepta: desde TypeScript
    // 5.7 `BufferSource` exige `ArrayBufferView<ArrayBuffer>`, y el `.buffer`
    // de un Buffer está tipado como `ArrayBufferLike` (podría ser un
    // SharedArrayBuffer). Una vista sobre la misma memoria arrastra ese tipo y
    // el compilador la rechaza igual, así que se copia a un Uint8Array propio,
    // que sí queda respaldado por un ArrayBuffer común.
    //
    // Copiar en vez de castear es a propósito: el cast taparía el día en que
    // buildXlsx/buildPdfTable devuelvan otra cosa, y el costo es una copia de
    // unos pocos cientos de kilobytes en una descarga manual.
    const bytes = new Uint8Array(body.byteLength);
    bytes.set(body);

    return new NextResponse(bytes, {
      headers: {
        'Content-Type': CONTENT_TYPES[format],
        // The filename is pure ASCII (usuarios-YYYY-MM-DD.ext), so the plain
        // `filename` parameter is enough — no RFC 5987 `filename*` needed.
        'Content-Disposition': `attachment; filename="${usersExportFilename(format, now)}"`,
        'Content-Length': String(body.length),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[admin users export] failed', err);
    return NextResponse.json({ error: 'export_failed' }, { status: 500 });
  }
}
