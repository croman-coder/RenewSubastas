import { getCurrentUser } from '@/lib/auth/server';
import { useTranslations } from 'next-intl';
import { Separator } from '@/components/ui/separator';

export default async function SettingsLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const user = await getCurrentUser(locale);
  return (
    <div className="max-w-5xl mx-auto p-6 grid grid-cols-1 md:grid-cols-[200px_1fr] gap-8">
      <SidebarNav locale={locale} role={user.role} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function SidebarNav({ locale, role }: { locale: string; role: 'admin' | 'staff' | 'buyer' }) {
  const t = useTranslations('settings.tabs');
  const items = [
    { href: `/${locale}/settings/profile`, label: t('profile') },
    { href: `/${locale}/settings/security`, label: t('security') },
    { href: `/${locale}/settings/preferences`, label: t('preferences') },
  ];
  if (role === 'buyer') {
    items.push({ href: `/${locale}/settings/danger-zone`, label: t('dangerZone') });
  }
  return (
    <nav aria-label="Settings">
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
      <Separator className="my-4 hidden md:block" />
    </nav>
  );
}
