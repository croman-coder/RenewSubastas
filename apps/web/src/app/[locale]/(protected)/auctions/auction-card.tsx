'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Heart, Clock, Gavel } from 'lucide-react';
import { doc, updateDoc, arrayRemove, arrayUnion } from 'firebase/firestore';
import { fb } from '@/lib/firebase/client';
import type { PublicAuction } from '@/lib/buyer/list-public-auctions';
import { SoldBanner } from '@/components/auctions/sold-banner';

interface Props {
  locale: string;
  auction: PublicAuction;
  isFavorite: boolean;
  buyerUid: string;
  index?: number;
}

export function AuctionCard({ locale, auction, isFavorite, buyerUid, index = 0 }: Props) {
  const t = useTranslations('buyer.auctions');
  const tStatus = useTranslations('buyer.auctions.status');
  const router = useRouter();
  const [fav, setFav] = useState(isFavorite);
  const [favBusy, setFavBusy] = useState(false);

  // countdown re-renders every second
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  async function toggleFav(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (favBusy) return;
    setFavBusy(true);
    const ref = doc(fb.db, 'users', buyerUid);
    try {
      if (fav) {
        await updateDoc(ref, { favorites: arrayRemove(auction.id) });
        setFav(false);
      } else {
        await updateDoc(ref, { favorites: arrayUnion(auction.id) });
        setFav(true);
      }
      router.refresh();
    } catch {
      // silent fail; user will see no change
    } finally {
      setFavBusy(false);
    }
  }

  const remainingMs = auction.endsAtMs - now;
  const displayPrice = auction.currentBid > 0 ? auction.currentBid : auction.startingPrice;
  const isUrgent = remainingMs > 0 && remainingMs < 60 * 60 * 1000;
  const isLive = auction.status === 'live';

  const cardLabel = `${auction.make} ${auction.model} ${auction.year}`;

  return (
    // Plain (non-interactive) wrapper — the actual navigation affordance is
    // the full-card overlay `<Link>` below. This card also contains a
    // favorite `<button>`; nesting a button inside an `<a>` is invalid HTML
    // and leaves both controls inconsistently keyboard/AT-reachable across
    // browsers. The overlay-link pattern keeps "click anywhere on the card
    // navigates" while the button stays a real sibling, reachable by Tab as
    // its own stop and clickable above the overlay via z-index.
    <div
      className={
        'sheen group relative block rounded-xl overflow-hidden border border-text-subtle/15 ' +
        'bg-bg-elev/40 transition-[border-color,background-color,transform,box-shadow] duration-300 ' +
        'hover:border-text-strong/40 hover:bg-bg-elev/70 ' +
        'hover:-translate-y-1 hover:shadow-[0_16px_40px_-18px_rgba(0,0,0,0.55)] ' +
        'animate-in fade-in slide-in-from-bottom-2 duration-300'
      }
      style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'both' }}
    >
      <Link
        href={`/${locale}/auctions/${auction.id}` as `/${string}`}
        aria-label={cardLabel}
        className={
          'absolute inset-0 z-0 rounded-xl ' +
          'active:scale-[0.99] ' +
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-text-strong/40 ' +
          'focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base'
        }
      />
      <div className="relative z-[1] aspect-[4/3] bg-bg-deep overflow-hidden pointer-events-none">
        {auction.thumbnailUrl ? (
          <img
            src={auction.thumbnailUrl}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="w-full h-full grid place-items-center text-text-subtle text-xs">
            <Gavel className="w-8 h-8 opacity-40" strokeWidth={1.5} />
          </div>
        )}
        {/* Subtle bottom gradient */}
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/55 via-black/15 to-transparent pointer-events-none"
        />
        {(auction.outcome === 'sold' || auction.outcome === 'sold_offline') && (
          <SoldBanner variant="card" />
        )}
        <button
          type="button"
          onClick={toggleFav}
          aria-label={fav ? t('removeFavorite') : t('addFavorite')}
          aria-pressed={fav}
          className={
            'absolute top-2.5 right-2.5 w-9 h-9 rounded-full grid place-items-center pointer-events-auto ' +
            'bg-black/40 backdrop-blur-md ring-1 ring-white/10 ' +
            'transition-all duration-200 hover:bg-black/60 hover:scale-105 active:scale-95 ' +
            (fav ? 'text-rose-400' : 'text-white/80 hover:text-rose-300')
          }
        >
          <Heart className="w-4 h-4" fill={fav ? 'currentColor' : 'transparent'} strokeWidth={2} />
        </button>
        <div className="absolute top-2.5 left-2.5">
          <StatusBadge status={auction.status} label={tStatus(auction.status)} />
        </div>
        <div
          className={
            'absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 ' +
            'rounded-md px-2 py-1 text-xs font-medium num-tab backdrop-blur-md ' +
            (isUrgent
              ? 'bg-rose-500/90 text-white animate-pulse'
              : 'bg-black/55 text-white ring-1 ring-white/10')
          }
        >
          <Clock className="w-3 h-3" strokeWidth={2.5} />
          {formatRemaining(remainingMs)}
        </div>
      </div>
      <div className="relative z-[1] p-3.5 space-y-2 pointer-events-none">
        <h3 className="font-medium text-text-strong tracking-tight truncate">
          {auction.make} {auction.model}{' '}
          <span className="num-tab text-text-muted font-normal">{auction.year}</span>
        </h3>
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-[11px] uppercase tracking-[0.06em] text-text-muted">
              {auction.currentBid > 0 ? 'Puja actual' : 'Precio inicial'}
            </p>
            <p
              className={
                'text-lg font-semibold num-tab tracking-tight ' +
                (isLive ? 'text-text-strong' : 'text-text-muted')
              }
            >
              USD {displayPrice.toLocaleString()}
            </p>
          </div>
          <span className="text-[11px] text-text-muted shrink-0 num-tab">
            {t('bidCount', { count: auction.bidCount })}
          </span>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  const map: Record<string, string> = {
    live: 'bg-emerald-500/90 text-white ring-emerald-400/30',
    scheduled: 'bg-amber-500/90 text-white ring-amber-400/30',
    ended: 'bg-zinc-700/85 text-zinc-200 ring-zinc-500/30',
    cancelled: 'bg-rose-600/90 text-white ring-rose-400/30',
  };
  const cls = map[status] ?? map['ended']!;
  return (
    <span
      className={
        'inline-flex items-center gap-1.5 rounded-md px-2 py-1 ' +
        'text-[10px] uppercase tracking-[0.08em] font-semibold ' +
        'backdrop-blur-md ring-1 ring-inset ' +
        cls
      }
    >
      {status === 'live' && (
        <span className="relative flex w-1.5 h-1.5">
          <span className="absolute inline-flex w-full h-full rounded-full bg-white/70 animate-ping" />
          <span className="relative inline-flex rounded-full w-1.5 h-1.5 bg-white" />
        </span>
      )}
      {label}
    </span>
  );
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (days > 0) return `${days}d ${pad(h)}:${pad(m)}`;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
