'use client';
import { useEffect, useState } from 'react';
import { collection, doc, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Clock, Flame } from 'lucide-react';
import { fb } from '@/lib/firebase/client';
import { Separator } from '@/components/ui/separator';
import { BlurNumber } from '@/components/brand/blur-number';
import type { AuctionDetail } from '@/lib/buyer/load-auction';
import type { AppConfigSnapshot } from '@/lib/admin/load-app-config';
import { BidPanel } from './bid-panel';
import { FinancingCalculator } from './financing-calculator';

// Money is denominated in USD with 2-decimal precision. Formatting it
// consistently here avoids the "USD 16.502,556" surface bug where a stray
// 8-decimal currentBid leaked into the big price number.
const fmtUsd = (n: number) =>
  n.toLocaleString('es-PY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface BidEntry {
  id: string;
  buyerSnapshot: { firstName: string; lastInitial: string };
  amount: number;
  createdAt: number;
}

export function AuctionDetailView({
  locale,
  initial,
  myUid,
  allowManualIncrement,
  financingConfig,
  currencyConfig,
}: {
  locale: string;
  initial: AuctionDetail;
  myUid: string;
  allowManualIncrement: boolean;
  financingConfig: AppConfigSnapshot['financing'];
  currencyConfig: AppConfigSnapshot['currency'];
}) {
  const t = useTranslations('buyer.auctions.detail');
  const tStatus = useTranslations('buyer.auctions.status');
  const [activeImg, setActiveImg] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [live, setLive] = useState<{
    currentBid: number;
    bidCount: number;
    endsAtMs: number;
    status: AuctionDetail['status'];
    currentBidderUid: string | null;
    outcome: string | null;
    winnerUid: string | null;
    // Kept live (not just the initial server-rendered value) so a staff edit
    // to buyNowPrice while a buyer has this page open — or a promotion from
    // scheduled to live — reaches the confirm dialog and the buyNow call
    // itself. Without this, the dialog could confirm a price that no longer
    // matches the stored one; see buyNow.ts's expectedPrice check for the
    // server-side half of this guard.
    buyNowPrice: number | null;
  }>({
    currentBid: initial.currentBid,
    bidCount: initial.bidCount,
    endsAtMs: initial.endsAtMs,
    status: initial.status,
    currentBidderUid: null,
    outcome: initial.outcome,
    winnerUid: null,
    buyNowPrice: initial.buyNowPrice,
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
        currentBidderUid: (data['currentBidderUid'] as string | undefined) ?? null,
        outcome: (data['outcome'] as string | undefined) ?? null,
        winnerUid: (data['winnerUid'] as string | undefined) ?? null,
        // Cleared via FieldValue.delete() when staff removes Compra ya, so
        // "field absent" and "never had one" both correctly collapse to null.
        buyNowPrice: (data['buyNowPrice'] as number | undefined) ?? null,
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
  // Once the clock runs out, treat the auction as ended even though the
  // scheduled tick may not have flipped the status field yet (it runs ~1/min).
  // Otherwise the UI keeps saying "En curso" with a live timer at 0.
  const effectiveStatus = live.status === 'live' && remainingMs <= 0 ? 'ended' : live.status;
  const isLive = effectiveStatus === 'live';
  const isUrgent = isLive && remainingMs > 0 && remainingMs < 60 * 60 * 1000;
  const isCritical = isLive && remainingMs > 0 && remainingMs < 60 * 1000;

  return (
    <div className="space-y-6">
      <a
        href={`/${locale}/auctions`}
        className="group inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-strong transition-colors"
      >
        <ArrowLeft className="w-4 h-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
        {t('back')}
      </a>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 lg:gap-8">
        <div className="space-y-6">
          {/* Photo gallery */}
          <div className="space-y-2">
            <div className="group aspect-[4/3] bg-bg-deep rounded-2xl overflow-hidden ring-1 ring-text-subtle/10 shadow-[0_24px_48px_-24px_rgba(0,0,0,0.5)]">
              {initial.images[activeImg] ? (
                <img
                  src={initial.images[activeImg].url}
                  alt=""
                  className="w-full h-full object-cover transition-transform duration-[600ms] ease-out group-hover:scale-[1.03]"
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
                      'aspect-square rounded-lg overflow-hidden ring-2 transition-all duration-200 ' +
                      (i === activeImg
                        ? 'ring-text-strong scale-[0.98]'
                        : 'ring-transparent opacity-60 hover:opacity-100 hover:ring-text-subtle/30')
                    }
                  >
                    <img src={img.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <header className="space-y-3">
            <div className="flex items-center gap-2">
              <StatusChip status={effectiveStatus} label={tStatus(effectiveStatus)} />
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-text-strong leading-[1.05]">
              {initial.make} {initial.model}{' '}
              <span className="num-tab text-text-muted font-light">{initial.year}</span>
            </h1>
          </header>

          <section>
            <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted mb-3">
              {t('specs')}
            </h2>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <Spec label={t('transmission')} value={initial.transmission} />
              <Spec label={t('fuelType')} value={initial.fuelType} />
              {initial.mileage !== null && (
                <Spec label={t('mileage')} value={`${initial.mileage.toLocaleString()} km`} />
              )}
              <Spec label={t('condition')} value={initial.condition} />
              {initial.color && <Spec label={t('color')} value={initial.color} />}
              {initial.licensePlate && <Spec label="Chapa" value={initial.licensePlate} />}
              {initial.vin && <Spec label={t('vin')} value={initial.vin} />}
            </dl>
          </section>

          <section>
            <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted mb-2">
              {t('description')}
            </h2>
            <p className="whitespace-pre-line text-text-strong text-base leading-relaxed">
              {description}
            </p>
          </section>
        </div>

        {/* Sticky bid panel */}
        <aside className="lg:sticky lg:top-20 self-start space-y-4">
          {/* Countdown — flashy neon-style card */}
          <CountdownCard
            label={t('timeLeft')}
            remainingMs={remainingMs}
            urgent={isUrgent}
            critical={isCritical}
            isLive={isLive}
          />

          {/* Price card */}
          <div className="ink-mesh sheen rounded-2xl border border-text-subtle/15 bg-bg-elev/50 p-5 space-y-2">
            <p className="text-[11px] uppercase tracking-[0.12em] text-text-muted font-medium">
              {live.currentBid > 0 ? 'Puja actual' : t('startingPrice')}
            </p>
            <p className="text-4xl sm:text-5xl font-bold tracking-tight num-tab text-text-strong">
              USD <BlurNumber value={displayPrice} format={fmtUsd} />
            </p>
            <p className="text-xs text-text-muted num-tab">
              {live.currentBid > 0 && <span>Inicial: USD {fmtUsd(initial.startingPrice)} · </span>}
              {live.bidCount} {live.bidCount === 1 ? 'puja' : 'pujas'} · incremento USD{' '}
              {fmtUsd(initial.bidIncrement)}
            </p>
          </div>

          <BidPanel
            auctionId={initial.id}
            status={live.status}
            endsAtMs={live.endsAtMs}
            startingPrice={initial.startingPrice}
            currentBid={live.currentBid}
            bidCount={live.bidCount}
            bidIncrement={initial.bidIncrement}
            currentBidderUid={live.currentBidderUid}
            outcome={live.outcome}
            winnerUid={live.winnerUid}
            buyNowPrice={live.buyNowPrice}
            make={initial.make}
            model={initial.model}
            year={initial.year}
            myUid={myUid}
            allowManualIncrement={allowManualIncrement}
          />
          <FinancingCalculator
            priceUsd={displayPrice}
            config={financingConfig}
            currency={currencyConfig}
            locale={locale}
          />
        </aside>
      </div>

      {/* Hidden entirely until the first bid. A heading over "Aún no hay
          pujas." is a section that announces itself and then says it has
          nothing — on a freshly opened lote that is every vehicle. The bid
          panel beside it already invites the first bid. */}
      {bids.length > 0 && (
        <>
          <Separator />

          <section>
            <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted mb-3">
              {t('bidsTitle')}
            </h2>
            <ul className="divide-y divide-text-subtle/15 rounded-xl border border-text-subtle/15 bg-bg-elev/40 overflow-hidden">
              {bids.map((b, i) => (
                <li
                  key={b.id}
                  className={
                    'flex items-center justify-between p-3 text-sm transition-colors hover:bg-bg-deep/40 ' +
                    (i === 0 ? 'bg-copper/5' : '')
                  }
                >
                  <span className="flex items-center gap-2">
                    {i === 0 && <Flame className="w-3.5 h-3.5 text-copper" />}
                    <span className={i === 0 ? 'text-text-strong font-medium' : 'text-text-strong'}>
                      {b.buyerSnapshot.firstName} {b.buyerSnapshot.lastInitial}.
                    </span>
                  </span>
                  <span className="num-tab">
                    <span className={i === 0 ? 'font-semibold text-copper' : ''}>
                      USD {fmtUsd(b.amount)}
                    </span>
                    <span className="text-text-muted text-xs ml-2">
                      {new Date(b.createdAt).toLocaleTimeString(locale)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="hover-lift rounded-lg border border-text-subtle/10 bg-bg-elev/30 px-3 py-2.5 hover:border-text-subtle/25 hover:bg-bg-elev/50">
      <dt className="text-text-muted text-[10px] uppercase tracking-[0.1em] font-semibold">
        {label}
      </dt>
      <dd className="text-text-strong text-sm mt-0.5 truncate">{value}</dd>
    </div>
  );
}

function StatusChip({ status, label }: { status: string; label: string }) {
  const map: Record<string, string> = {
    live: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30',
    scheduled: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-amber-500/30',
    ended: 'bg-zinc-500/15 text-zinc-300 ring-zinc-500/30',
    cancelled: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
  };
  const cls = map[status] ?? map['ended']!;
  return (
    <span
      className={
        'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 ' +
        'text-[11px] uppercase tracking-[0.08em] font-semibold ' +
        'ring-1 ring-inset ' +
        cls
      }
    >
      {status === 'live' && (
        <span className="relative flex w-1.5 h-1.5">
          <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400/70 animate-ping" />
          <span className="relative inline-flex rounded-full w-1.5 h-1.5 bg-emerald-400" />
        </span>
      )}
      {label}
    </span>
  );
}

function CountdownCard({
  label,
  remainingMs,
  urgent,
  critical,
  isLive,
}: {
  label: string;
  remainingMs: number;
  urgent: boolean;
  critical: boolean;
  isLive: boolean;
}) {
  const ended = remainingMs <= 0;
  const total = Math.max(0, Math.floor(remainingMs / 1000));
  const days = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  // Color theme switches as urgency rises.
  const tone = ended
    ? {
        glow: 'shadow-none',
        text: 'text-text-muted',
        accent: 'from-zinc-500/0 via-zinc-400/30 to-zinc-500/0',
      }
    : critical
      ? {
          glow: 'shadow-[0_0_40px_-4px_rgba(244,63,94,0.55)]',
          text: 'text-rose-400',
          accent: 'from-rose-500/0 via-rose-400/70 to-rose-500/0',
        }
      : urgent
        ? {
            glow: 'shadow-[0_0_36px_-6px_rgba(251,146,60,0.5)]',
            text: 'text-amber-700 dark:text-amber-300',
            accent: 'from-amber-500/0 via-amber-400/70 to-amber-500/0',
          }
        : {
            glow: 'shadow-[0_0_36px_-6px_rgba(0,0,0,0.35)]',
            text: 'text-copper',
            accent: 'from-copper/0 via-copper/70 to-copper/0',
          };

  const showDays = days > 0 && !ended;

  return (
    <div
      className={
        'relative overflow-hidden rounded-2xl border border-text-subtle/15 bg-bg-elev/60 p-5 ' +
        'transition-shadow duration-500 ' +
        tone.glow
      }
    >
      {/* Top hairline gradient accent */}
      <div
        aria-hidden
        className={'absolute inset-x-0 top-0 h-px bg-gradient-to-r ' + tone.accent}
      />
      {/* Subtle radial glow background */}
      {!ended && (
        <div
          aria-hidden
          className={
            'absolute -top-12 -right-12 w-40 h-40 rounded-full blur-3xl pointer-events-none ' +
            (critical ? 'bg-rose-500/15' : urgent ? 'bg-amber-500/15' : 'bg-copper/15')
          }
        />
      )}

      <div className="relative space-y-2">
        <div className="flex items-center gap-1.5">
          <Clock
            className={'w-3.5 h-3.5 ' + tone.text + (critical ? ' animate-pulse' : '')}
            strokeWidth={2.5}
          />
          <p className="text-[11px] uppercase tracking-[0.12em] font-semibold text-text-muted">
            {label}
          </p>
        </div>

        {ended ? (
          <p className="text-2xl font-bold tracking-tight text-text-muted num-tab">Finalizada</p>
        ) : (
          <div className="flex items-end gap-3 flex-wrap">
            {showDays && <DigitGroup value={days} unit="d" tone={tone.text} small />}
            <DigitGroup value={h} unit="h" tone={tone.text} />
            <DigitGroup value={m} unit="m" tone={tone.text} />
            <DigitGroup value={s} unit="s" tone={tone.text} pulsing={isLive && critical} />
          </div>
        )}
      </div>
    </div>
  );
}

function DigitGroup({
  value,
  unit,
  tone,
  small,
  pulsing,
}: {
  value: number;
  unit: string;
  tone: string;
  small?: boolean;
  pulsing?: boolean;
}) {
  const padded = String(value).padStart(2, '0');
  return (
    <div className="flex items-baseline gap-0.5">
      <span
        className={
          'font-bold num-tab tracking-tight tabular-nums ' +
          (small ? 'text-3xl' : 'text-5xl sm:text-[3.5rem] sm:leading-[1]') +
          ' ' +
          tone +
          (pulsing ? ' animate-pulse' : '')
        }
        style={{
          textShadow: pulsing
            ? '0 0 20px currentColor, 0 0 40px currentColor'
            : '0 0 24px currentColor',
        }}
      >
        {padded}
      </span>
      <span className={'text-xs font-semibold uppercase tracking-wider ' + tone + '/70'}>
        {unit}
      </span>
    </div>
  );
}
