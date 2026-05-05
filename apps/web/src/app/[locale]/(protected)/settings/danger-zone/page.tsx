import { requireRole } from '@/lib/auth/server';
import { getTranslations } from 'next-intl/server';
import { DeleteAccountDialog } from './delete-account-dialog';

export default async function DangerZonePage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const user = await requireRole(locale, ['buyer']);
  const t = await getTranslations('settings.dangerZone');
  return (
    <div className="space-y-4 max-w-xl">
      <h1 className="text-2xl font-semibold text-danger">{t('title')}</h1>
      <p className="text-sm text-text-muted">{t('subtitle')}</p>
      <p className="text-sm">{t('deleteDescription')}</p>
      <DeleteAccountDialog uid={user.uid} locale={locale} />
    </div>
  );
}
