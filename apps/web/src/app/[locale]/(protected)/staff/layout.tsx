import { requireRole } from '@/lib/auth/server';
import { getTranslations } from 'next-intl/server';

export default async function StaffLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  await requireRole(locale, ['admin', 'staff']);
  const t = await getTranslations('staff.nav');
  const items = [
    { href: `/${locale}/staff`, label: t('home') },
    { href: `/${locale}/staff/vehicles`, label: t('vehicles') },
    { href: `/${locale}/staff/auctions`, label: t('auctions') },
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6 max-w-7xl mx-auto p-6">
      <nav aria-label="Staff">
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
