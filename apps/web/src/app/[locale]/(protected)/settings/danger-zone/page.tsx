import { AlertTriangle } from 'lucide-react';
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
    <section className="max-w-xl">
      {/* The tab strip already says "Zona de peligro", so the page itself
          starts with the actual action card instead of repeating the title. */}
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/[0.04] p-5 sm:p-6 space-y-4">
        <header className="flex items-start gap-3">
          <span className="w-9 h-9 rounded-lg bg-rose-500/15 text-rose-300 grid place-items-center shrink-0">
            <AlertTriangle className="w-5 h-5" strokeWidth={2.25} />
          </span>
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-text-strong">
              Eliminar mi cuenta
            </h2>
            <p className="text-sm text-text-muted mt-0.5">{t('subtitle')}</p>
          </div>
        </header>
        <p className="text-sm text-text-strong leading-relaxed">{t('deleteDescription')}</p>
        <DeleteAccountDialog uid={user.uid} locale={locale} />
      </div>
    </section>
  );
}
