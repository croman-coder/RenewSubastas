import { useTranslations } from 'next-intl';
import { CarbidWordmark } from '@/components/brand/carbid-wordmark';
import { ThemeToggle } from '@/components/theme/theme-toggle';

export default function HomePage() {
  const t = useTranslations('home');
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 p-8">
      <CarbidWordmark size="xl" />
      <h1 className="text-3xl font-semibold text-text-strong">{t('title')}</h1>
      <p className="text-text-muted">{t('subtitle')}</p>
      <ThemeToggle />
    </main>
  );
}
