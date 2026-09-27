'use client';
import { useEffect, useRef, useState } from 'react';
import { collection, doc, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Flame } from 'lucide-react';
import { fb } from '@/lib/firebase/client';
import { Separator } from '@/components/ui/separator';
import { BlurNumber } from '@/components/brand/blur-number';
import { trackViewContent } from '@/lib/analytics/meta-events';
import type { AuctionDetail } from '@/lib/buyer/load-auction';
import type { AppConfigSnapshot } from '@/lib/admin/load-app-config';
import { formatAmount as fmtUsd, formatNumber } from '@/lib/format/money';
import { vehicleEnumLabelKey, type VehicleEnumField } from '@/lib/format/vehicle-labels';
import { vehicleAlt } from '@/lib/format/vehicle-alt';
import {
  AuctionGallery,
  CountdownCard,
  SpecTile,
  StatusChip,
} from '@/components/auctions/detail-parts';
import { FinancingCalculator } from '@/components/auctions/financing-calculator';
import { BidDock } from '@/components/auctions/bid-dock';
import { dockState, type DockState } from '@/lib/auctions/dock-state';
import { minimumBid } from '@/lib/auctions/minimum-bid';
import { BidPanel } from './bid-panel';

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
  isBuyer,
}: {
  locale: string;
  initial: AuctionDetail;
  myUid: string;
  allowManualIncrement: boolean;
  financingConfig: AppConfigSnapshot['financing'];
  currencyConfig: AppConfigSnapshot['currency'];
  /** Solo el comprador tiene barra fija y hoja; staff y admin ven la ficha como hoy. */
  isBuyer: boolean;
}) {
  const t = useTranslations('buyer.auctions.detail');
  const tStatus = useTranslations('buyer.auctions.status');
  const tVehicle = useTranslations('staff.vehicles.form');
  const vehicleLabel = (field: VehicleEnumField, value: string) => {
    const key = vehicleEnumLabelKey(field, value);
    return key ? tVehicle(key) : value;
  };
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

  // Meta's ViewContent: this buyer opened this vehicle's page. One per view,
  // not one per render — the ref is what makes that true under React's Strict
  // Mode, which deliberately runs every effect twice in development.
  //
  // The price sent is the LISTED one, not the live bid: it is the figure that
  // identifies the vehicle in Meta's reports, and it must not drift every
  // time somebody else bids.
  const viewedRef = useRef<string | null>(null);
  useEffect(() => {
    if (viewedRef.current === initial.id) return;
    viewedRef.current = initial.id;
    trackViewContent({
      auctionId: initial.id,
      make: initial.make,
      model: initial.model,
      year: initial.year,
      value: initial.startingPrice,
    });
  }, [initial.id, initial.make, initial.model, initial.year, initial.startingPrice]);

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

  // Barra fija de puja del celular (spec 2026-09-27 §5.4).
  const dock: DockState = isBuyer
    ? dockState(
        { ...live, startsAtMs: initial.startsAtMs },
        myUid,
        now,
        minimumBid({
          currentBid: live.currentBid,
          startingPrice: initial.startingPrice,
          bidIncrement: initial.bidIncrement,
        }),
      )
    : { kind: 'hidden' };
  // Con la barra a la vista, el panel del costado se esconde por debajo de lg
  // y la puja se hace desde la hoja. Sin barra (terminada, o staff) el panel
  // queda visible: es el que muestra "¡Ganaste la subasta!" o la franja de
  // vendida, y en el celular no hay otro lugar donde verlo.
  const asidePanelClass = dock.kind === 'hidden' ? undefined : 'hidden lg:block';
  // Las mismas props para el panel del costado y el de la hoja: que no puedan
  // desalinearse.
  const bidPanelProps = {
    auctionId: initial.id,
    status: live.status,
    endsAtMs: live.endsAtMs,
    startingPrice: initial.startingPrice,
    currentBid: live.currentBid,
    bidCount: live.bidCount,
    bidIncrement: initial.bidIncrement,
    currentBidderUid: live.currentBidderUid,
    outcome: live.outcome,
    winnerUid: live.winnerUid,
    buyNowPrice: live.buyNowPrice,
    make: initial.make,
    model: initial.model,
    year: initial.year,
    myUid,
    allowManualIncrement,
  };

  return (
    <div className="space-y-6">
      <a
        href={`/${locale}/auctions`}
        className="group inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-strong transition-colors"
      >
        <ArrowLeft className="w-4 h-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
        {t('back')}
      </a>

      {/* En celular el orden es fotos → estado y título → cuenta regresiva →
          precio → datos, igual que la ficha pública (tanda 2A), y la puja pasa
          a la barra fija de abajo (spec 2026-09-27 §5.4). En escritorio la
          columna derecha sigue fija al lado de fotos y datos; la segunda fila
          es 1fr para que, si esa columna es más alta, el espacio sobrante
          quede debajo de los datos y no entre el título y las especificaciones. */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] lg:grid-rows-[auto_1fr] gap-6 lg:gap-x-8">
        <div className="space-y-6 min-w-0 lg:col-start-1 lg:row-start-1">
          <AuctionGallery
            images={initial.images}
            alt={vehicleAlt(initial.make, initial.model, initial.year)}
          />

          <header className="space-y-3">
            <div className="flex items-center gap-2">
              <StatusChip status={effectiveStatus} label={tStatus(effectiveStatus)} />
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-text-strong leading-[1.05]">
              {initial.make} {initial.model}{' '}
              <span className="num-tab text-text-muted font-light">{initial.year}</span>
            </h1>
          </header>
        </div>

        {/* Sticky bid panel */}
        <aside className="lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:sticky lg:top-20 self-start space-y-4">
          {/* Countdown — flashy neon-style card */}
          <CountdownCard
            label={t('timeLeft')}
            remainingMs={remainingMs}
            urgent={isUrgent}
            critical={isCritical}
            isLive={isLive}
          />

          {/* Price card */}
          <div className="rounded-2xl border border-text-subtle/15 bg-bg-elev p-5 space-y-2 shadow-card">
            <p className="text-[11px] uppercase tracking-[0.12em] text-text-muted font-semibold">
              {live.currentBid > 0 ? 'Puja actual' : t('startingPrice')}
            </p>
            {/* "USD" as a smaller prefix on the same line: at text-5xl the
                full "USD 29.000,00" used to break into two lines. */}
            <p className="flex items-baseline gap-2 whitespace-nowrap text-4xl sm:text-5xl font-extrabold tracking-tight num-tab text-text-strong">
              <span className="text-xl sm:text-2xl font-bold text-text-muted">USD</span>
              <BlurNumber value={displayPrice} format={fmtUsd} />
            </p>
            <p className="text-xs text-text-muted num-tab">
              {live.currentBid > 0 && <span>Inicial: USD {fmtUsd(initial.startingPrice)} · </span>}
              {live.bidCount} {live.bidCount === 1 ? 'puja' : 'pujas'} · incremento USD{' '}
              {fmtUsd(initial.bidIncrement)}
            </p>
          </div>

          <div className={asidePanelClass}>
            <BidPanel {...bidPanelProps} />
          </div>
          <FinancingCalculator
            priceUsd={displayPrice}
            config={financingConfig}
            currency={currencyConfig}
            locale={locale}
          />
        </aside>

        <div className="space-y-6 min-w-0 lg:col-start-1 lg:row-start-2">
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted mb-3">
              {t('specs')}
            </h2>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <SpecTile
                label={t('transmission')}
                value={vehicleLabel('transmission', initial.transmission)}
              />
              <SpecTile label={t('fuelType')} value={vehicleLabel('fuelType', initial.fuelType)} />
              {initial.mileage !== null && (
                <SpecTile label={t('mileage')} value={`${formatNumber(initial.mileage)} km`} />
              )}
              <SpecTile
                label={t('condition')}
                value={vehicleLabel('condition', initial.condition)}
              />
              {initial.color && <SpecTile label={t('color')} value={initial.color} />}
              {initial.licensePlate && <SpecTile label="Chapa" value={initial.licensePlate} />}
              {initial.vin && <SpecTile label={t('vin')} value={initial.vin} />}
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
            <ul className="divide-y divide-text-subtle/15 rounded-xl border border-text-subtle/15 bg-bg-elev overflow-hidden">
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

      <BidDock
        state={dock}
        sheetTitle={`Pujar · ${vehicleAlt(initial.make, initial.model, initial.year)}`}
        renderPanel={(close) => <BidPanel {...bidPanelProps} onBidPlaced={close} />}
      />
    </div>
  );
}
