import Link from 'next/link';
import { ArrowRight, Clock } from 'lucide-react';
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
      {/* Dirección A (2026-09-26): the cars lead. The batch clock is one line
          beside the title and the personal numbers are one strip of links —
          they used to be a full-width clock plus four big tiles, which on a
          phone pushed the first car below the second screen. */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-text-strong text-pretty">
            Subastas en curso
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Hola, {user.firstName || 'Buyer'} — estas son las unidades disponibles ahora.
          </p>
        </div>
        {clock !== null && (
          <BatchCountdown
            endsAtMs={clock.at}
            mode={clock.mode}
            variant="compact"
            className="self-start sm:self-auto"
          />
        )}
      </header>

      {/* Every pill links into the view it summarises — a number the buyer
          can't act on is just decoration. */}
      <nav aria-label="Tu actividad">
        <ul className="flex flex-wrap gap-2">
          <ActivityLink href={`/${locale}/auctions`} label="Activas" value={stats.liveAuctions} />
          <ActivityLink
            href={`/${locale}/${audience}/bids`}
            label="Vas ganando"
            value={stats.myWinningCount}
            emphasis={stats.myWinningCount > 0}
          />
          <ActivityLink
            href={`/${locale}/${audience}/bids`}
            label="Mis pujas"
            value={stats.myActiveBidsCount}
          />
          <ActivityLink
            href={`/${locale}/${audience}/won`}
            label="Ganadas"
            value={stats.myWonCount}
          />
        </ul>
      </nav>

      <section aria-labelledby="grid-heading" className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 id="grid-heading" className="text-lg font-bold tracking-tight text-text-strong">
              Vehículos disponibles
            </h2>
            <p className="text-sm text-text-muted num-tab">
              {items.length} {items.length === 1 ? 'unidad' : 'unidades'}
            </p>
          </div>
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

function ActivityLink({
  href,
  label,
  value,
  emphasis = false,
}: {
  href: string;
  label: string;
  value: number;
  /** Success tone — used for "Vas ganando" while the buyer leads something. */
  emphasis?: boolean;
}) {
  return (
    <li>
      <Link
        href={href as `/${string}`}
        className={
          'inline-flex items-center gap-2 h-9 px-3.5 rounded-full border text-sm [touch-action:manipulation] ' +
          'transition-[border-color,background-color] duration-200 ' +
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-text-strong/40 ' +
          'focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base ' +
          (emphasis
            ? 'border-transparent bg-[#dcfce7] text-[#166534] dark:bg-[rgb(22_101_52/0.4)] dark:text-[#bbf7d0]'
            : 'border-text-subtle/20 bg-bg-elev text-text-muted hover:border-text-strong/35')
        }
      >
        <span
          className={
            'num-tab font-extrabold tracking-tight ' + (emphasis ? '' : 'text-text-strong')
          }
        >
          {value}
        </span>
        <span className="font-medium">{label}</span>
      </Link>
    </li>
  );
}
