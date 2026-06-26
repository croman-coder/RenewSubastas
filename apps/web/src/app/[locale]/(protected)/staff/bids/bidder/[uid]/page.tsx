import { requireRole } from '@/lib/auth/server';
import { BidderDetail } from './bidder-detail';

export default async function BidderPage({
  params: { locale, uid },
}: {
  params: { locale: string; uid: string };
}) {
  await requireRole(locale, ['admin', 'staff']);
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <p className="text-[11px] uppercase tracking-[0.12em] text-text-muted font-semibold">
          Pujador
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-text-strong">
          Historial de pujas
        </h1>
      </header>
      <BidderDetail uid={uid} locale={locale} />
    </div>
  );
}
