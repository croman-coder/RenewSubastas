'use client';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Clock, Gavel, Heart } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { PublicAuction } from '@/lib/buyer/list-public-auctions';
import type { OwnStatePill } from '@/lib/buyer/my-auction-states';
import { isSoldOutcome } from '@/lib/auctions/sold-outcome';
import { formatAmount } from '@/lib/format/money';
import { formatCountdown, remainingLabel } from '@/lib/format/remaining';
import { useFavorite } from './use-favorite';

interface Props {
  locale: string;
  auction: PublicAuction;
  /** Reloj compartido de la lista: un solo intervalo para todas las filas. */
  nowMs: number;
  pill: OwnStatePill | null;
  isFavorite: boolean;
  buyerUid: string;
}

/**
 * Una subasta como fila, por debajo de sm (spec 2026-09-27 §5.3): miniatura
 * 104×84, modelo y año, precio, estado propio y tiempo. Mismo patrón que la
 * tarjeta: un link que cubre la fila y el corazón como botón hermano encima,
 * para no anidar un botón dentro de un <a>.
 */
export function AuctionRow({ locale, auction, nowMs, pill, isFavorite, buyerUid }: Props) {
  const t = useTranslations('buyer.auctions');
  const { fav, toggle } = useFavorite(auction.id, buyerUid, isFavorite);
  const isSold = isSoldOutcome(auction.outcome);
  const price = auction.currentBid > 0 ? auction.currentBid : auction.startingPrice;
  const remainingMs = auction.endsAtMs - nowMs;
  const urgent = auction.status === 'live' && remainingMs > 0 && remainingMs < 3_600_000;
  const label = `${auction.make} ${auction.model} ${auction.year}${isSold ? ' — vendido' : ''}`;
  const shownPill: OwnStatePill | null = isSold ? { variant: 'neutral', label: 'Vendido' } : pill;

  return (
    <div className="relative flex gap-3 rounded-2xl border border-text-subtle/20 bg-bg-elev p-2.5 shadow-card">
      <Link
        href={`/${locale}/auctions/${auction.id}` as `/${string}`}
        aria-label={label}
        className="absolute inset-0 z-0 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-text-strong/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
      />
      <div className="pointer-events-none relative z-[1] h-[84px] w-[104px] shrink-0 overflow-hidden rounded-xl bg-bg-deep">
        {auction.thumbnailUrl ? (
          <img
            src={auction.thumbnailUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full w-full place-items-center">
            <Gavel
              className="h-6 w-6 text-text-subtle opacity-60"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </div>
        )}
      </div>
      <div className="pointer-events-none relative z-[1] min-w-0 flex-1">
        <p className="truncate pr-9 font-bold tracking-tight text-text-strong">
          {auction.make} {auction.model}{' '}
          <span className="num-tab font-normal text-text-muted">{auction.year}</span>
        </p>
        <p className="mt-0.5 text-[11px] uppercase tracking-[0.06em] text-text-muted">
          {auction.currentBid > 0 ? 'Puja actual' : 'Precio inicial'}
        </p>
        <p className="num-tab text-lg font-extrabold leading-tight tracking-tight text-text-strong">
          USD {formatAmount(price)}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          {shownPill && (
            <Badge
              variant={shownPill.variant}
              className="px-2 py-0 text-[10px] uppercase tracking-[0.06em]"
            >
              {shownPill.label}
            </Badge>
          )}
          <span
            // El reloj del servidor y el del navegador difieren por un instante.
            suppressHydrationWarning
            className={
              'inline-flex items-center gap-1 text-xs num-tab ' +
              (urgent ? 'font-semibold text-danger' : 'text-text-muted')
            }
          >
            <Clock className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
            {auction.status === 'scheduled'
              ? `Abre en ${remainingLabel(auction.startsAtMs - nowMs)}`
              : formatCountdown(remainingMs)}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={toggle}
        aria-label={fav ? t('removeFavorite') : t('addFavorite')}
        aria-pressed={fav}
        className={
          'absolute right-1 top-1 z-[2] grid h-11 w-11 place-items-center rounded-full transition-colors ' +
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-text-strong/40 ' +
          (fav ? 'text-rose-500' : 'text-text-muted hover:text-rose-500')
        }
      >
        <Heart className="h-4 w-4" fill={fav ? 'currentColor' : 'transparent'} strokeWidth={2} />
      </button>
    </div>
  );
}
