import { requireRole } from '@/lib/auth/server';
import { getTranslations } from 'next-intl/server';

export default async function AdminLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  await requireRole(locale, ['admin']);
  const t = await getTranslations('admin.nav');
  const items = [
    { href: `/${locale}/admin`, label: t('home') },
    { href: `/${locale}/admin/users`, label: t('users') },
    { href: `/${locale}/admin/audit`, label: t('audit') },
    { href: `/${locale}/admin/config`, label: t('config') },
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6 max-w-7xl mx-auto p-6">
      <nav aria-label="Admin">
        <ul className="flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-visible">
          {items.map((it) => (
            <li key={it.href}>
              <a
                href={it.href}
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
