import { listLandingAuctions } from '@/lib/buyer/landing-auctions';
import { PublicAuctionCard } from './public-auction-card';

/** Hasta cuatro subastas abiertas de la lista cacheada del landing, sin la actual. */
export async function OtherLiveAuctions({
  locale,
  excludeId,
}: {
  locale: string;
  excludeId: string;
}) {
  const items = (await listLandingAuctions())
    .filter((a) => a.id !== excludeId && (a.status === 'live' || a.status === 'scheduled'))
    .slice(0, 4);
  if (items.length === 0) return null;
  return (
    <section className="space-y-4 pt-4">
      <h2 className="text-xl font-semibold tracking-tight text-text-strong">
        Otras subastas en vivo
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {items.map((a, i) => (
          // El desfasaje del índice mantiene estas tarjetas debajo del pliegue con carga diferida y animadas.
          <PublicAuctionCard key={a.id} locale={locale} auction={a} index={i + 4} />
        ))}
      </div>
    </section>
  );
}
