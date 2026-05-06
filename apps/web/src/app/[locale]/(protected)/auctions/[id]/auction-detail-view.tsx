'use client';
import { useEffect, useState } from 'react';
import { collection, doc, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useTranslations } from 'next-intl';
import { fb } from '@/lib/firebase/client';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { AuctionDetail } from '@/lib/buyer/load-auction';

interface BidEntry {
  id: string;
  buyerSnapshot: { firstName: string; lastInitial: string };
  amount: number;
  createdAt: number;
}

export function AuctionDetailView({ locale, initial }: { locale: string; initial: AuctionDetail }) {
  const t = useTranslations('buyer.auctions.detail');
  const tStatus = useTranslations('buyer.auctions.status');
  const [activeImg, setActiveImg] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [live, setLive] = useState<{
    currentBid: number;
    bidCount: number;
    endsAtMs: number;
    status: AuctionDetail['status'];
  }>({
    currentBid: initial.currentBid,
    bidCount: initial.bidCount,
    endsAtMs: initial.endsAtMs,
    status: initial.status,
  });
  const [bids, setBids] = useState<BidEntry[]>([]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const unsubAuction = onSnapshot(doc(fb.db, 'auctions', initial.id), (s) => {
      const data = s.data();
      if (!data) return;
      const ms = (k: string) =>
        (data[k] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
      setLive({
        currentBid: (data['currentBid'] as number) ?? 0,
        bidCount: (data['bidCount'] as number) ?? 0,
        endsAtMs: ms('endsAt'),
        status: (data['status'] as AuctionDetail['status']) ?? 'scheduled',
      });
    });
    const q = query(
      collection(fb.db, 'auctions', initial.id, 'bids'),
      orderBy('amount', 'desc'),
      limit(50),
    );
    const unsubBids = onSnapshot(q, (snap) => {
      setBids(
        snap.docs.map((d) => {
          const data = d.data();
          const buyer = (data['buyerSnapshot'] ?? {}) as {
            firstName?: string;
            lastInitial?: string;
          };
          const createdAt =
            (data['createdAt'] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
          return {
            id: d.id,
            buyerSnapshot: {
              firstName: buyer.firstName ?? '',
              lastInitial: buyer.lastInitial ?? '',
            },
            amount: (data['amount'] as number) ?? 0,
            createdAt,
          };
        }),
      );
    });
    return () => {
      unsubAuction();
      unsubBids();
    };
  }, [initial.id]);

  const remainingMs = live.endsAtMs - now;
  const displayPrice = live.currentBid > 0 ? live.currentBid : initial.startingPrice;
  const description =
    locale === 'en' && initial.descriptionEn ? initial.descriptionEn : initial.descriptionEs;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <a href={`/${locale}/auctions`} className="text-sm text-text-muted hover:text-text-strong">
        {t('back')}
      </a>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
        <div className="space-y-6">
          {/* Photo gallery */}
          <div className="space-y-2">
            <div className="aspect-[4/3] bg-bg-deep rounded-lg overflow-hidden">
              {initial.images[activeImg] ? (
                <img
                  src={initial.images[activeImg].url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full grid place-items-center text-text-subtle">
                  sin fotos
                </div>
              )}
            </div>
            {initial.images.length > 1 && (
              <div className="grid grid-cols-6 gap-2">
                {initial.images.slice(0, 12).map((img, i) => (
                  <button
                    key={img.url}
                    type="button"
                    onClick={() => setActiveImg(i)}
                    className={
                      'aspect-square rounded overflow-hidden border-2 ' +
                      (i === activeImg ? 'border-copper' : 'border-transparent')
                    }
                  >
                    <img src={img.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <header>
            <h1 className="text-3xl font-semibold text-text-strong">
              {initial.make} {initial.model}{' '}
              <span className="num-tab text-text-muted">{initial.year}</span>
            </h1>
            <Badge variant="secondary" className="mt-2">
              {tStatus(live.status)}
            </Badge>
          </header>

          <section>
            <h2 className="text-lg font-medium text-text-strong mb-3">{t('specs')}</h2>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <Spec label={t('transmission')} value={initial.transmission} />
              <Spec label={t('fuelType')} value={initial.fuelType} />
              {initial.mileage !== null && (
                <Spec label={t('mileage')} value={`${initial.mileage.toLocaleString()} km`} />
              )}
              <Spec label={t('condition')} value={initial.condition} />
              {initial.color && <Spec label={t('color')} value={initial.color} />}
              {initial.vin && <Spec label={t('vin')} value={initial.vin} />}
            </dl>
          </section>

          <section>
            <h2 className="text-lg font-medium text-text-strong mb-2">{t('description')}</h2>
            <p className="whitespace-pre-line text-text-strong">{description}</p>
          </section>
        </div>

        {/* Sticky bid panel */}
        <aside className="lg:sticky lg:top-6 self-start space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base text-text-muted font-normal">
                {t('timeLeft')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-3xl font-semibold num-tab text-copper">
                {formatRemaining(remainingMs)}
              </p>
              <Separator />
              <div>
                <p className="text-sm text-text-muted">
                  USD {initial.startingPrice.toLocaleString()} ({t('startingPrice')})
                </p>
                <p className="text-3xl font-semibold num-tab">
                  USD {displayPrice.toLocaleString()}
                </p>
                <p className="text-xs text-text-muted mt-1">
                  {live.bidCount} pujas · incremento USD {initial.bidIncrement.toLocaleString()}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('bidPlaceholderTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-text-muted">{t('bidPlaceholderBody')}</p>
            </CardContent>
          </Card>
        </aside>
      </div>

      <Separator />

      <section>
        <h2 className="text-lg font-medium text-text-strong mb-3">{t('bidsTitle')}</h2>
        {bids.length === 0 ? (
          <p className="text-text-muted text-sm">{t('noBidsYet')}</p>
        ) : (
          <ul className="divide-y divide-text-subtle/20 border border-text-subtle/20 rounded">
            {bids.map((b) => (
              <li key={b.id} className="flex items-center justify-between p-3 text-sm">
                <span>
                  {b.buyerSnapshot.firstName} {b.buyerSnapshot.lastInitial}.
                </span>
                <span className="num-tab">
                  USD {b.amount.toLocaleString()}
                  <span className="text-text-muted text-xs ml-2">
                    {new Date(b.createdAt).toLocaleTimeString(locale)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-text-muted text-xs uppercase tracking-wide">{label}</dt>
      <dd className="text-text-strong">{value}</dd>
    </div>
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
