import Link from 'next/link';
import { requireRole } from '@/lib/auth/server';
import { filterBuyerContacts } from '@/lib/staff/buyer-contacts';
import { listBuyerContacts } from '@/lib/staff/list-buyer-contacts';
import { formatPhoneForReading, phoneDigits, telUrl, whatsappUrl } from '@/lib/admin/contact-links';
import { formatDateTimePy } from '@/lib/format/date';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface PageProps {
  params: { locale: string };
  searchParams?: { q?: string | string[] };
}

// Contactos de compradores para staff y admin. El layout de /staff también deja
// pasar a finanzas (por el libro de ventas), y a esa cuenta no le corresponden
// los teléfonos de todos los usuarios: por eso el guard va en la página.
export default async function StaffBuyersPage({ params: { locale }, searchParams }: PageProps) {
  await requireRole(locale, ['admin', 'staff']);

  // Next entrega un arreglo si `?q=` viene repetido: se toma solo el texto.
  const q = typeof searchParams?.q === 'string' ? searchParams.q : '';
  const all = await listBuyerContacts();
  const items = filterBuyerContacts(all, q);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text-strong">Compradores</h1>
          <p className="text-sm text-text-muted num-tab">
            {q ? `${items.length} de ${all.length}` : `${all.length}`} compradores
          </p>
        </div>
        <Link href={`/${locale}/staff/buyers/new` as `/${string}`}>
          <Button>Nuevo usuario</Button>
        </Link>
      </header>

      <form method="get" className="flex max-w-md gap-2">
        <Input
          name="q"
          defaultValue={q}
          placeholder="Buscar por nombre, teléfono o correo"
          aria-label="Buscar comprador"
        />
        <Button type="submit" variant="secondary">
          Buscar
        </Button>
      </form>

      <div className="border border-text-subtle/20 rounded">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Correo</TableHead>
              <TableHead>Alta</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-text-muted py-8">
                  No hay compradores que coincidan.
                </TableCell>
              </TableRow>
            )}
            {items.map((u) => {
              const digits = phoneDigits(u.phone);
              const shown = formatPhoneForReading(u.phone);
              return (
                <TableRow key={u.uid}>
                  <TableCell>{u.name}</TableCell>
                  <TableCell className="num-tab">
                    {digits && shown ? (
                      <span className="inline-flex flex-wrap items-center gap-x-3">
                        <a href={telUrl(digits)} className="hover:underline">
                          {shown}
                        </a>
                        <a
                          href={whatsappUrl(digits)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-text-muted hover:text-text-strong underline"
                        >
                          WhatsApp
                        </a>
                      </span>
                    ) : (
                      <span className="text-text-muted">
                        {u.phone ? `${u.phone} (no válido)` : 'Sin teléfono'}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{u.email}</TableCell>
                  <TableCell className="text-sm text-text-muted num-tab">
                    {u.createdAt ? formatDateTimePy(locale, u.createdAt) : '—'}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
