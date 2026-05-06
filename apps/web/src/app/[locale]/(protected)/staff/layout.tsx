import { requireRole } from '@/lib/auth/server';
import { getTranslations } from 'next-intl/server';

export default async function StaffLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  // Admin users navigating to /staff/* keep their full admin sidebar so they
  // never feel like they switched apps. Staff users see the trimmed staff nav.
  const user = await requireRole(locale, ['admin', 'staff']);
  const isAdmin = user.role === 'admin';
  const tStaff = await getTranslations('staff.nav');
  const tAdmin = await getTranslations('admin.nav');

  const items = isAdmin
    ? [
        { href: `/${locale}/admin`, label: tAdmin('home') },
        { href: `/${locale}/admin/users`, label: tAdmin('users') },
        { href: `/${locale}/staff/vehicles`, label: tAdmin('vehicles') },
        { href: `/${locale}/staff/auctions`, label: tAdmin('auctions') },
        { href: `/${locale}/admin/audit`, label: tAdmin('audit') },
        { href: `/${locale}/admin/config`, label: tAdmin('config') },
      ]
    : [
        { href: `/${locale}/staff`, label: tStaff('home') },
        { href: `/${locale}/staff/vehicles`, label: tStaff('vehicles') },
        { href: `/${locale}/staff/auctions`, label: tStaff('auctions') },
      ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6 max-w-7xl mx-auto p-6">
      <nav aria-label={isAdmin ? 'Admin' : 'Staff'}>
        <ul className="flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-visible">
          {items.map((it) => (
            <li key={it.href}>
              <a
                href={it.href as `/${string}`}
                className="block px-3 py-2 rounded text-sm text-text-strong hover:bg-bg-elev"
              >
                {it.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
