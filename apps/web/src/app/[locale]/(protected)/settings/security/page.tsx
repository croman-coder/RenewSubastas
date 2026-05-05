import { useTranslations } from 'next-intl';
import { Separator } from '@/components/ui/separator';
import { ChangePasswordForm } from './change-password-form';
import { RevokeSessionsButton } from './revoke-sessions-button';

export default function SecurityPage({ params: { locale } }: { params: { locale: string } }) {
  const t = useTranslations('settings.security');
  return (
    <div className="space-y-8 max-w-xl">
      <h1 className="text-2xl font-semibold text-text-strong">{t('title')}</h1>
      <ChangePasswordForm />
      <Separator />
      <RevokeSessionsButton locale={locale} />
    </div>
  );
}
