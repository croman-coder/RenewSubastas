import { getCurrentUser } from '@/lib/auth/server';
import { getTranslations } from 'next-intl/server';
import { SettingsSubnav } from './_subnav';

export default async function SettingsLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const user = await getCurrentUser(locale);
  const t = await getTranslations('settings.tabs');
  const items = [
    { href: `/${locale}/settings/profile`, label: t('profile') },
    { href: `/${locale}/settings/security`, label: t('security') },
    { href: `/${locale}/settings/preferences`, label: t('preferences') },
  ];
  if (user.role === 'buyer') {
    items.push({ href: `/${locale}/settings/danger-zone`, label: t('dangerZone') });
  }
  return (
    <div className="space-y-6">
      <SettingsSubnav items={items} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
