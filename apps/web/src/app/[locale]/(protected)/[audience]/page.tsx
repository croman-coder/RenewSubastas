import Link from 'next/link';
import { ArrowRight, Clock } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/server';
import { loadBuyerStats, type BuyerStats } from '@/lib/buyer/load-buyer-stats';
import { loadFavorites } from '@/lib/buyer/load-favorites';
import { listPublicAuctions } from '@/lib/buyer/list-public-auctions';
import { loadAppConfigSnapshot } from '@/lib/admin/load-app-config';
import { commitment } from '@/lib/buyer/mobile-home';
import { formatAmount, formatNumber } from '@/lib/format/money';
import { remainingLabel } from '@/lib/format/remaining';
import { BatchCountdown } from '@/components/auctions/batch-countdown';
import { NextClosingCard } from '@/components/buyer/next-closing-card';
import { batchClock } from '@/lib/auctions/batch';
import { AuctionCard } from '../auctions/auction-card';

interface PageProps {
  params: { locale: string; audience: 'retail' | 'wholesale' };
}

/** How many cars the home shows before sending the buyer to the full catalog. */
const HOME_GRID_LIMIT = 12;

/**
 * Buyer home.
 *
 * Desde el 2026-09-27 (spec celular-comprador §5.2) es un tablero, primero
 * pensado para el teléfono: tus números, la próxima subasta que cierra con su
 * reloj, lo que te comprometés si ganás todo, y lo que cierra pronto. La
 * grilla de vehículos sigue abajo sin cambios. En escritorio los bloques se
 * acomodan en dos columnas; es la única pantalla del comprador que cambia en
 * escritorio.
 *
 * The audience comes from the URL segment, validated by the layout, and is
 * passed to every query so the page can only ever show what the URL claims.
 */
export default async function BuyerHome({ params: { locale, audience } }: PageProps) {
  const user = await getCurrentUser(locale);
  const [stats, favorites, items, config] = await Promise.all([
    loadBuyerStats(user.uid, audience),
    loadFavorites(user.uid),
    listPublicAuctions({ tab: 'all', audience }),
    loadAppConfigSnapshot(),
  ]);

  const favSet = new Set(favorites);
  const shown = items.slice(0, HOME_GRID_LIMIT);
  const hasMore = items.length > shown.length;
  const clock = batchClock(items);
  const owed = commitment(stats.myWinning, config.payment.depositPercent);
  const depositPct = Math.round(config.payment.depositPercent * 100);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-muted">
          Hola, {user.firstName || 'comprador'}
        </p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-text-strong text-pretty sm:text-3xl">
          Tu actividad de hoy
        </h1>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
        <div className="space-y-4">
          {/* Cada número lleva a la vista que resume: un número con el que no
              se puede hacer nada es decoración. "Activas" pasó a la pestaña
              Subastas. */}
          <nav aria-label="Tu actividad">
            <ul className="grid grid-cols-3 divide-x divide-text-subtle/15 overflow-hidden rounded-2xl border border-text-subtle/15 bg-bg-elev shadow-card">
              <StatLink
                href={`/${locale}/${audience}/bids`}
                label="Vas ganando"
                value={stats.myWinningCount}
                emphasis={stats.myWinningCount > 0}
              />
              <StatLink
                href={`/${locale}/${audience}/bids`}
                label="Mis pujas"
                value={stats.myActiveBidsCount}
              />
              <StatLink
                href={`/${locale}/${audience}/won`}
                label="Ganadas"
                value={stats.myWonCount}
              />
            </ul>
          </nav>

          {owed.count > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <MoneyTile
                label="Si ganás todo"
                amountUsd={owed.totalUsd}
                note={`${owed.count} ${owed.count === 1 ? 'subasta que vas ganando' : 'subastas que vas ganando'}`}
              />
              <MoneyTile
                label="Seña a pagar"
                amountUsd={owed.depositUsd}
                note={`${depositPct} % en ${config.payment.deadlineHours} h al ganar`}
              />
            </div>
          )}
        </div>

        <NextClosingCard
          locale={locale}
          myWinning={stats.myWinning}
          closingSoon={stats.closingSoon}
          myBidAuctionIds={stats.myBidAuctionIds}
        />
      </div>

      {stats.closingSoon.length > 0 && (
        <ClosingSoonStrip locale={locale} items={stats.closingSoon} />
      )}

      <section aria-labelledby="grid-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 id="grid-heading" className="text-lg font-bold tracking-tight text-text-strong">
              Vehículos disponibles
            </h2>
            <p className="text-sm text-text-muted num-tab">
              {items.length} {items.length === 1 ? 'unidad' : 'unidades'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {clock !== null && (
              <BatchCountdown endsAtMs={clock.at} mode={clock.mode} variant="compact" />
            )}
            <Link
              href={`/${locale}/auctions` as `/${string}`}
              className={
                'shrink-0 inline-flex items-center gap-1 text-sm font-semibold text-text-strong ' +
                'underline-offset-4 hover:underline [touch-action:manipulation] ' +
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-text-strong/40 rounded-md'
              }
            >
              Ver catálogo
              <ArrowRight className="w-4 h-4" strokeWidth={2.25} aria-hidden="true" />
            </Link>
          </div>
        </div>

        {shown.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-text-subtle/25 bg-bg-elev px-6 py-14 text-center">
            <Clock
              className="w-8 h-8 mx-auto text-text-subtle opacity-50"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <p className="mt-3 text-sm font-medium text-text-strong">
              No hay subastas activas en este momento
            </p>
            <p className="mt-1 text-sm text-text-muted">
              Te avisamos apenas se publique una nueva.
            </p>
          </div>
        ) : (
          <>
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {shown.map((a, i) => (
                <li key={a.id} className="min-w-0">
                  <AuctionCard
                    locale={locale}
                    auction={a}
                    isFavorite={favSet.has(a.id)}
                    buyerUid={user.uid}
                    index={i}
                  />
                </li>
              ))}
            </ul>
            {hasMore && (
              <div className="pt-1 text-center">
                <Link
                  href={`/${locale}/auctions` as `/${string}`}
                  className={
                    'inline-flex items-center gap-1.5 h-11 px-5 rounded-lg text-sm font-semibold ' +
                    'bg-text-strong text-bg-base [touch-action:manipulation] ' +
                    'transition-opacity duration-200 hover:opacity-90 ' +
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-text-strong/40 ' +
                    'focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base'
                  }
                >
                  Ver las {items.length} unidades
                  <ArrowRight className="w-4 h-4" strokeWidth={2.25} aria-hidden="true" />
                </Link>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function StatLink({
  href,
  label,
  value,
  emphasis = false,
}: {
  href: string;
  label: string;
  value: number;
  /** Tono de éxito: "Vas ganando" mientras el comprador va primero en algo. */
  emphasis?: boolean;
}) {
  return (
    <li className="min-w-0">
      <Link
        href={href as `/${string}`}
        className={
          'flex flex-col items-center justify-center gap-0.5 px-2 py-4 text-center ' +
          '[touch-action:manipulation] transition-colors duration-200 hover:bg-bg-deep/50 ' +
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-text-strong/40'
        }
      >
        <span
          className={
            'num-tab text-2xl font-extrabold tracking-tight ' +
            (emphasis ? 'text-success' : 'text-text-strong')
          }
        >
          {formatNumber(value)}
        </span>
        <span className="text-xs font-medium text-text-muted">{label}</span>
      </Link>
    </li>
  );
}

function MoneyTile({ label, amountUsd, note }: { label: string; amountUsd: number; note: string }) {
  return (
    <div className="rounded-xl border border-text-subtle/15 bg-bg-elev p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">{label}</p>
      <p className="mt-1 whitespace-nowrap num-tab text-xl font-extrabold tracking-tight text-text-strong">
        USD {formatAmount(amountUsd)}
      </p>
      <p className="mt-0.5 text-xs text-text-muted">{note}</p>
    </div>
  );
}

/**
 * Fila deslizable "Cierran pronto". Server component: el tiempo se escribe al
 * renderizar y no corre (es orientativo; el reloj que corre está en la
 * tarjeta en tinta y en la ficha).
 */
function ClosingSoonStrip({ locale, items }: { locale: string; items: BuyerStats['closingSoon'] }) {
  const now = Date.now();
  return (
    <section aria-labelledby="closing-heading" className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <h2 id="closing-heading" className="text-lg font-bold tracking-tight text-text-strong">
          Cierran pronto
        </h2>
        <Link
          href={`/${locale}/auctions?tab=closing` as `/${string}`}
          className="inline-flex items-center gap-1 rounded-md text-sm font-semibold text-text-strong underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-text-strong/40"
        >
          Ver todas
          <ArrowRight className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
        </Link>
      </div>
      <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 scrollbar-none md:mx-0 md:px-0">
        {items.map((a) => (
          <li key={a.id} className="w-40 shrink-0 snap-start">
            <Link
              href={`/${locale}/auctions/${a.id}` as `/${string}`}
              className="block overflow-hidden rounded-xl border border-text-subtle/15 bg-bg-elev focus:outline-none focus-visible:ring-2 focus-visible:ring-text-strong/40"
            >
              <div className="aspect-[4/3] bg-bg-deep">
                {a.thumbnailUrl && (
                  <img
                    src={a.thumbnailUrl}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
              <div className="space-y-0.5 p-2.5">
                <p className="truncate text-sm font-bold text-text-strong">
                  {a.make} {a.model}
                </p>
                <p className="num-tab text-sm font-semibold text-text-strong">
                  USD {formatAmount(a.currentBid > 0 ? a.currentBid : a.startingPrice)}
                </p>
                <p className="num-tab text-xs text-text-muted">
                  Cierra en {remainingLabel(a.endsAtMs - now)}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
