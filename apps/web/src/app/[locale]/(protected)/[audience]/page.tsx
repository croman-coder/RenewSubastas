import Link from 'next/link';
import { ArrowRight, Clock, Gavel, Heart, Trophy } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth/server';
import { loadBuyerStats } from '@/lib/buyer/load-buyer-stats';
import { loadFavorites } from '@/lib/buyer/load-favorites';
import { listPublicAuctions } from '@/lib/buyer/list-public-auctions';
import { BatchCountdown } from '@/components/auctions/batch-countdown';
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
 * The auctions ARE the landing: a buyer who signs in wants to see what's on
 * the block, not a dashboard about themselves. Personal numbers survive as a
 * compact strip above the grid rather than a full KPI dashboard — they're
 * context, not the destination. Deeper views (all bids, won, favorites) stay
 * one click away in the strip and the nav.
 *
 * The audience comes from the URL segment, validated by the layout, and is
 * passed to every query so the page can only ever show what the URL claims.
 */
export default async function BuyerHome({ params: { locale, audience } }: PageProps) {
  const user = await getCurrentUser(locale);
  const [stats, favorites, items] = await Promise.all([
    loadBuyerStats(user.uid, audience),
    loadFavorites(user.uid),
    listPublicAuctions({ tab: 'all', audience }),
  ]);

  const favSet = new Set(favorites);
  const shown = items.slice(0, HOME_GRID_LIMIT);
  const hasMore = items.length > shown.length;
  const clock = batchClock(items);

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-text-strong text-pretty">
            Subastas en curso
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Hola, {user.firstName || 'Buyer'} — estas son las unidades disponibles ahora.
          </p>
        </div>
        <Link
          href={`/${locale}/auctions` as `/${string}`}
          className={
            'shrink-0 inline-flex items-center gap-1.5 h-10 px-4 rounded-lg text-sm font-medium ' +
            'border border-text-subtle/25 text-text-strong [touch-action:manipulation] ' +
            'transition-colors duration-200 hover:bg-bg-elev/70 ' +
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-text-strong/40'
          }
        >
          Ver catálogo completo
          <ArrowRight className="w-4 h-4" strokeWidth={2.25} aria-hidden="true" />
        </Link>
      </header>

      {/* Batch clock. Every lote closes at the same time, so it leads. */}
      {clock !== null && <BatchCountdown endsAtMs={clock.at} mode={clock.mode} />}

      {/* Compact personal strip. Every tile is a link into the detail view it
          summarises — a number the buyer can't act on is just decoration. */}
      <ul className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          href={`/${locale}/auctions`}
          icon={Gavel}
          label="Activas"
          value={stats.liveAuctions}
        />
        <StatTile
          href={`/${locale}/${audience}/bids`}
          icon={Trophy}
          label="Estoy ganando"
          value={stats.myWinningCount}
          emphasis
        />
        <StatTile
          href={`/${locale}/${audience}/bids`}
          icon={Heart}
          label="Mis pujas"
          value={stats.myActiveBidsCount}
        />
        <StatTile
          href={`/${locale}/${audience}/won`}
          icon={Trophy}
          label="Ganadas"
          value={stats.myWonCount}
        />
      </ul>

      <section aria-labelledby="grid-heading" className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <h2 id="grid-heading" className="text-lg font-semibold tracking-tight text-text-strong">
            Vehículos disponibles
          </h2>
          <p className="text-sm text-text-muted num-tab shrink-0">
            {items.length} {items.length === 1 ? 'unidad' : 'unidades'}
          </p>
        </div>

        {shown.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-text-subtle/25 bg-bg-elev/30 px-6 py-14 text-center">
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

function StatTile({
  href,
  icon: Icon,
  label,
  value,
  emphasis = false,
}: {
  href: string;
  icon: typeof Gavel;
  label: string;
  value: number;
  emphasis?: boolean;
}) {
  return (
    <li className="min-w-0">
      <Link
        href={href as `/${string}`}
        className={
          'group flex items-center gap-3 rounded-xl border px-3.5 py-3 [touch-action:manipulation] ' +
          'transition-[border-color,background-color] duration-200 ' +
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-text-strong/40 ' +
          'focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base ' +
          (emphasis
            ? 'border-copper/30 bg-copper/[0.07] hover:border-copper/50'
            : 'border-text-subtle/15 bg-bg-elev/40 hover:border-text-strong/30 hover:bg-bg-elev/70')
        }
      >
        <span
          className={
            'shrink-0 w-9 h-9 rounded-lg grid place-items-center ring-1 ' +
            (emphasis
              ? 'bg-copper/15 ring-copper/25 text-copper'
              : 'bg-text-strong/[0.07] ring-text-subtle/20 text-text-strong')
          }
        >
          <Icon className="w-4 h-4" strokeWidth={2.25} aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block text-xl font-semibold num-tab tracking-tight text-text-strong leading-none">
            {value}
          </span>
          <span className="block mt-1 text-xs text-text-muted truncate">{label}</span>
        </span>
      </Link>
    </li>
  );
}
