import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getOptionalUser } from '@/lib/auth/server';
import { loadAuction } from '@/lib/buyer/load-auction';
import { loadAppConfigSnapshot } from '@/lib/admin/load-app-config';
import { auctionPath, type PublicAuctionDetail } from '@/lib/buyer/public-auction';
import { loadPublicAuction } from '@/lib/buyer/load-public-auction';
import { findRelistedAuction } from '@/lib/buyer/find-relisted-auction';
import { needsRelistLookup, publicAuctionState } from '@/lib/auctions/public-state';
import { auctionMetadata, vehicleJsonLd, type VehicleLabels } from '@/lib/seo/auction-seo';
import { vehicleEnumLabelKey, type VehicleEnumField } from '@/lib/format/vehicle-labels';
import { SITE_URL } from '@/lib/seo/site';
import { PublicAuctionView } from '@/components/public/public-auction-view';
import { PublicAuctionFinished } from '@/components/public/public-auction-finished';
import { OtherLiveAuctions } from '@/components/public/other-live-auctions';
import { AuctionDetailView } from './auction-detail-view';
import { ViewTracker } from '@/components/insights/view-tracker';

interface Props {
  params: { locale: string; id: string };
}

async function vehicleLabels(locale: string, d: PublicAuctionDetail): Promise<VehicleLabels> {
  const t = await getTranslations({ locale, namespace: 'staff.vehicles.form' });
  const label = (field: VehicleEnumField, value: string) => {
    const key = vehicleEnumLabelKey(field, value);
    return key ? t(key) : value;
  };
  return {
    fuel: label('fuelType', d.fuelType),
    transmission: label('transmission', d.transmission),
  };
}

async function resolveState(d: PublicAuctionDetail, id: string) {
  const relisted = needsRelistLookup(d) ? await findRelistedAuction(d.vehicleId, id) : null;
  return publicAuctionState(d, relisted, Date.now());
}

export async function generateMetadata({ params: { locale, id } }: Props): Promise<Metadata> {
  const detail = await loadPublicAuction(id);
  // Wholesale o desconocida: no hay nada público que describir, y nunca es indexable.
  if (!detail)
    return { title: 'Subasta · Renew Subastas', robots: { index: false, follow: false } };
  return auctionMetadata(
    detail,
    await vehicleLabels(locale, detail),
    await resolveState(detail, id),
    locale,
  );
}

export default async function AuctionDetailPage({ params: { locale, id } }: Props) {
  const user = await getOptionalUser();
  if (!user) {
    const detail = await loadPublicAuction(id);
    if (!detail) notFound();
    const state = await resolveState(detail, id);
    // A propósito temporal: si la subasta nueva también termina sin vender,
    // este link tiene que seguir la misma regla otra vez (spec §6).
    if (state.kind === 'redirect') redirect(auctionPath(locale, state.toAuctionId));
    const [config, labels] = await Promise.all([
      loadAppConfigSnapshot(),
      vehicleLabels(locale, detail),
    ]);
    const jsonLd = JSON.stringify(vehicleJsonLd(detail, labels, state, locale)).replace(
      /</g,
      '\\u003c',
    );
    return (
      <div className="space-y-10">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
        {state.kind === 'finished' ? (
          <PublicAuctionFinished locale={locale} detail={detail} result={state.result} />
        ) : (
          <PublicAuctionView
            locale={locale}
            detail={detail}
            kind={state.kind}
            shareUrl={`${SITE_URL}${auctionPath(locale, id)}`}
            financingConfig={config.financing}
            currencyConfig={config.currency}
          />
        )}
        <OtherLiveAuctions locale={locale} excludeId={id} />
      </div>
    );
  }

  const [auction, config] = await Promise.all([loadAuction(id), loadAppConfigSnapshot()]);
  if (!auction) notFound();
  // loadAuction lee con el Admin SDK, que se saltea firestore.rules —
  // replicamos el mismo gate de audience que imponen las reglas para que un
  // comprador retail no llegue a una subasta wholesale (precio, VIN, chapa)
  // solo por conocer su id. Staff/admin/finanzas ven todo, igual que las
  // reglas.
  if (user.role === 'buyer' && auction.audience !== (user.audience ?? 'retail')) notFound();

  return (
    <>
      <ViewTracker auctionId={id} />
      <AuctionDetailView
        locale={locale}
        initial={auction}
        myUid={user.uid}
        allowManualIncrement={config.bid.allowManualIncrement}
        financingConfig={config.financing}
        currencyConfig={config.currency}
      />
    </>
  );
}
