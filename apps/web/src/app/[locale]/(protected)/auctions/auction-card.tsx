'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { doc, updateDoc, arrayRemove, arrayUnion } from 'firebase/firestore';
import { fb } from '@/lib/firebase/client';
import { Badge } from '@/components/ui/badge';
import type { PublicAuction } from '@/lib/buyer/list-public-auctions';

interface Props {
  locale: string;
  auction: PublicAuction;
  isFavorite: boolean;
  buyerUid: string;
}

export function AuctionCard({ locale, auction, isFavorite, buyerUid }: Props) {
  const t = useTranslations('buyer.auctions');
  const tStatus = useTranslations('buyer.auctions.status');
  const router = useRouter();
  const [fav, setFav] = useState(isFavorite);

  // countdown re-renders every second
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  async function toggleFav(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
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
      // silent fail
    }
  }

  const remainingMs = auction.endsAtMs - now;
  const displayPrice = auction.currentBid > 0 ? auction.currentBid : auction.startingPrice;
  const isUrgent = remainingMs > 0 && remainingMs < 60 * 60 * 1000;

  return (
    <Link
      href={`/${locale}/auctions/${auction.id}` as `/${string}`}
      className="block group rounded-lg border border-text-subtle/20 overflow-hidden bg-bg-elev hover:border-copper hover:shadow-lg transition-all duration-200 active:scale-[0.98] animate-in fade-in slide-in-from-bottom-1 duration-300"
    >
      <div className="relative aspect-[4/3] bg-bg-deep overflow-hidden">
        {auction.thumbnailUrl ? (
          <img
            src={auction.thumbnailUrl}
            alt=""
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full grid place-items-center text-text-subtle text-sm">
            sin foto
          </div>
        )}
        <button
          type="button"
          onClick={toggleFav}
          aria-label={fav ? t('removeFavorite') : t('addFavorite')}
          className="absolute top-2 right-2 w-9 h-9 rounded-full bg-bg-base/80 backdrop-blur grid place-items-center text-lg"
        >
          {fav ? '♥' : '♡'}
        </button>
        <div className="absolute top-2 left-2">
          <Badge variant={auction.status === 'live' ? 'default' : 'secondary'}>
            {tStatus(auction.status)}
          </Badge>
        </div>
      </div>
      <div className="p-3 space-y-1">
        <h3 className="font-medium text-text-strong">
          {auction.make} {auction.model}{' '}
          <span className="num-tab text-text-muted">{auction.year}</span>
        </h3>
        <div className="flex items-baseline justify-between">
          <span className="text-lg font-semibold num-tab">USD {displayPrice.toLocaleString()}</span>
          <span className="text-xs text-text-muted">
            {t('bidCount', { count: auction.bidCount })}
          </span>
        </div>
        <p
          className={`text-xs num-tab ${isUrgent ? 'text-danger animate-pulse font-medium' : 'text-copper'}`}
        >
          {formatRemaining(remainingMs)}
        </p>
      </div>
    </Link>
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
  if (days > 0) return `${days}d ${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
