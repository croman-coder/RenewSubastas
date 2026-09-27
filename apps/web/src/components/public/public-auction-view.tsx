'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import {
  AuctionGallery,
  CountdownCard,
  SpecTile,
  StatusChip,
} from '@/components/auctions/detail-parts';
import { FinancingCalculator } from '@/components/auctions/financing-calculator';
import { SoldBanner } from '@/components/auctions/sold-banner';
import { BidCta } from './bid-cta';
import { ShareAuction } from './share-auction';
import { trackViewContent } from '@/lib/analytics/meta-events';
import { effectivePublicKind, type PublicViewKind } from '@/lib/auctions/public-state';
import { formatAmount, formatNumber } from '@/lib/format/money';
import { vehicleAlt } from '@/lib/format/vehicle-alt';
import { vehicleEnumLabelKey, type VehicleEnumField } from '@/lib/format/vehicle-labels';
import type { PublicAuctionDetail } from '@/lib/buyer/public-auction';
import type { AppConfigSnapshot } from '@/lib/admin/load-app-config';

interface Props {
  locale: string;
  detail: PublicAuctionDetail;
  kind: PublicViewKind;
  shareUrl: string;
  financingConfig: AppConfigSnapshot['financing'];
  currencyConfig: AppConfigSnapshot['currency'];
}

/**
 * La ficha de subasta para visitantes sin cuenta (spec 2026-09-26 §5): todo
 * menos pujar. Sin listeners de Firestore —los navegadores anónimos no
 * pueden leer subastas—, así que los precios vienen del servidor (cacheados
 * 30 s) y acá solo corre el reloj: la cuenta regresiva y, con ella, el estado
 * que se muestra (effectivePublicKind), que puede ir por delante del guardado.
 */
export function PublicAuctionView({
  locale,
  detail,
  kind,
  shareUrl,
  financingConfig,
  currencyConfig,
}: Props) {
  const t = useTranslations('buyer.auctions.detail');
  const tStatus = useTranslations('buyer.auctions.status');
  const tVehicle = useTranslations('staff.vehicles.form');
  const label = (field: VehicleEnumField, value: string) => {
    const key = vehicleEnumLabelKey(field, value);
    return key ? tVehicle(key) : value;
  };

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Mismo ViewContent de Meta que la página con sesión: uno por vista, no por render.
  const viewed = useRef<string | null>(null);
  useEffect(() => {
    if (viewed.current === detail.id) return;
    viewed.current = detail.id;
    trackViewContent({
      auctionId: detail.id,
      make: detail.make,
      model: detail.model,
      year: detail.year,
      value: detail.startingPrice,
    });
  }, [detail]);

  const title = vehicleAlt(detail.make, detail.model, detail.year);
  // Programada ya abierta → en curso; en curso ya cerrada → terminada.
  const shown = effectivePublicKind(kind, detail.startsAtMs, detail.endsAtMs, now);
  const chipStatus = shown === 'sold-visible' ? 'ended' : shown;
  const isLive = shown === 'live';
  const remainingMs = (shown === 'scheduled' ? detail.startsAtMs : detail.endsAtMs) - now;
  const price = detail.currentBid > 0 ? detail.currentBid : detail.startingPrice;
  const description =
    locale === 'en' && detail.descriptionEn ? detail.descriptionEn : detail.descriptionEs;

  return (
    <div className="space-y-6">
      <Link
        href={`/${locale}` as `/${string}`}
        className="group inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-strong transition-colors"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Ver todas las subastas
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 lg:gap-8">
        <div className="space-y-6 min-w-0">
          <AuctionGallery images={detail.images} alt={title} />
          <header className="space-y-3">
            <StatusChip status={chipStatus} label={tStatus(chipStatus)} />
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-text-strong leading-[1.05]">
              {detail.make} {detail.model}{' '}
              <span className="num-tab text-text-muted font-light">{detail.year}</span>
            </h1>
          </header>
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted mb-3">
              {t('specs')}
            </h2>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <SpecTile
                label={t('transmission')}
                value={label('transmission', detail.transmission)}
              />
              <SpecTile label={t('fuelType')} value={label('fuelType', detail.fuelType)} />
              {detail.mileage !== null && (
                <SpecTile label={t('mileage')} value={`${formatNumber(detail.mileage)} km`} />
              )}
              <SpecTile label={t('condition')} value={label('condition', detail.condition)} />
              {detail.color && <SpecTile label={t('color')} value={detail.color} />}
            </dl>
          </section>
          {description && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted mb-2">
                {t('description')}
              </h2>
              <p className="whitespace-pre-line text-text-strong text-base leading-relaxed">
                {description}
              </p>
            </section>
          )}
        </div>

        <aside className="lg:sticky lg:top-20 self-start space-y-4">
          {shown === 'sold-visible' ? (
            <SoldBanner variant="detail" />
          ) : (
            <CountdownCard
              label={shown === 'scheduled' ? 'Abre en' : t('timeLeft')}
              remainingMs={remainingMs}
              urgent={isLive && remainingMs < 3_600_000}
              critical={isLive && remainingMs < 60_000}
              isLive={isLive}
            />
          )}
          <div className="rounded-2xl border border-text-subtle/15 bg-bg-elev p-5 space-y-2 shadow-card">
            <p className="text-[11px] uppercase tracking-[0.12em] text-text-muted font-semibold">
              {detail.currentBid > 0 ? 'Puja actual' : t('startingPrice')}
            </p>
            <p className="flex items-baseline gap-2 whitespace-nowrap text-4xl sm:text-5xl font-extrabold tracking-tight num-tab text-text-strong">
              <span className="text-xl sm:text-2xl font-bold text-text-muted">USD</span>
              {formatAmount(price)}
            </p>
            <p className="text-xs text-text-muted num-tab">
              {detail.bidCount} {detail.bidCount === 1 ? 'puja' : 'pujas'} · incremento USD{' '}
              {formatAmount(detail.bidIncrement)}
            </p>
          </div>
          {/* Sin invitación a pujar una vez cerrada: ya no hay nada que pujar. */}
          {(shown === 'scheduled' || shown === 'live') && (
            <BidCta locale={locale} auctionId={detail.id} scheduled={shown === 'scheduled'} />
          )}
          <ShareAuction title={title} url={shareUrl} />
          {shown !== 'sold-visible' && (
            <FinancingCalculator
              priceUsd={price}
              config={financingConfig}
              currency={currencyConfig}
              locale={locale}
            />
          )}
        </aside>
      </div>
    </div>
  );
}
