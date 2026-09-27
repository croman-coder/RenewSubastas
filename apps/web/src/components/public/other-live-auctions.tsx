import { listLandingAuctions } from '@/lib/buyer/landing-auctions';
import { PublicAuctionCard } from './public-auction-card';

/**
 * Hasta cuatro subastas abiertas (en curso o programadas) de la lista
 * cacheada del landing, sin la actual.
 */
export async function OtherLiveAuctions({
  locale,
  excludeId,
}: {
  locale: string;
  excludeId: string;
}) {
  // Es un agregado al pie de la ficha: si el catálogo no se puede leer, la
  // ficha sale igual, sin este bloque, en lugar de responder un 500 entero.
  const all = await listLandingAuctions().catch((err: unknown) => {
    console.error('[otras-subastas] no se pudo leer el catálogo', err);
    return [];
  });
  const items = all
    .filter((a) => a.id !== excludeId && (a.status === 'live' || a.status === 'scheduled'))
    .slice(0, 4);
  if (items.length === 0) return null;
  return (
    <section className="space-y-4 pt-4">
      <h2 className="text-xl font-semibold tracking-tight text-text-strong">Otras subastas</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {items.map((a, i) => (
          // El desfasaje del índice mantiene estas tarjetas debajo del pliegue con carga diferida y animadas.
          <PublicAuctionCard key={a.id} locale={locale} auction={a} index={i + 4} />
        ))}
      </div>
    </section>
  );
}
