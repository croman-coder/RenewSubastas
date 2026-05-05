import { getCurrentUser } from '@/lib/auth/server';
import { getTranslations } from 'next-intl/server';
import { LogoutButton } from './logout-button';

interface LayoutProps {
  children: React.ReactNode;
  params: { locale: string };
}

export default async function ProtectedLayout({ children, params: { locale } }: LayoutProps) {
  const user = await getCurrentUser(locale);
  const t = await getTranslations('common');

  return (
    <div className="min-h-screen flex flex-col bg-bg-base">
      <header className="border-b border-text-subtle/20 px-6 py-3 flex items-center justify-between bg-bg-elev">
        <div className="flex items-center gap-3">
          <a href={`/${locale}`} className="font-wordmark font-bold tracking-tight text-xl">
            <span className="text-copper">CAR</span>
            <span className="text-ink">BID</span>
          </a>
          <span className="text-xs uppercase text-text-muted bg-bg-deep rounded px-2 py-0.5">
            {user.role}
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <a
            href={`/${locale}/settings/profile`}
            className="text-text-muted hover:text-text-strong"
          >
            {t('settings')}
          </a>
          <span className="text-text-muted">{user.email}</span>
          <LogoutButton locale={locale} />
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
