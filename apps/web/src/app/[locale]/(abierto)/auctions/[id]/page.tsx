import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getOptionalSession } from '@/lib/auth/server';
import { SESSION_COOKIE_NAME } from '@/lib/auth/constants';
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
  // Lecturas en paralelo con la verificación de la sesión, como la ficha antes
  // de ser pública: la configuración la usan las dos ramas, y la subasta
  // completa solo la usa la rama con sesión, así que se pide solo si llegó la
  // cookie. La rama que no usa una de estas promesas la descarta; el catch
  // vacío evita que su rechazo quede sin manejar. La rama que sí la usa la
  // espera y recibe el error tal cual, igual que antes.
  const configLoad = loadAppConfigSnapshot();
  const auctionLoad = cookies().get(SESSION_COOKIE_NAME)?.value ? loadAuction(id) : null;
  configLoad.catch(() => undefined);
  auctionLoad?.catch(() => undefined);

  const { user, verificationFailed } = await getOptionalSession();
  // Hay cookie pero la consulta a Google falló: no es un visitante, es un
  // comprador al que no pudimos verificar. Mismo destino que las páginas con
  // sesión (getCurrentUser): el login con el aviso de reintentar, que no borra
  // la cookie, y `from` para volver a esta subasta.
  if (verificationFailed) {
    redirect(
      `/${locale}/login?error=temporary&from=${encodeURIComponent(auctionPath(locale, id))}`,
    );
  }
  if (!user) {
    const detail = await loadPublicAuction(id);
    if (!detail) notFound();
    const state = await resolveState(detail, id);
    // A propósito temporal: si la subasta nueva también termina sin vender,
    // este link tiene que seguir la misma regla otra vez (spec §6).
    if (state.kind === 'redirect') redirect(auctionPath(locale, state.toAuctionId));
    const [config, labels] = await Promise.all([configLoad, vehicleLabels(locale, detail)]);
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

  // Con usuario siempre hubo cookie, así que `auctionLoad` ya está en camino;
  // el `??` solo le da a TypeScript el caso que no puede ocurrir.
  const [auction, config] = await Promise.all([auctionLoad ?? loadAuction(id), configLoad]);
  if (!auction) notFound();
  // loadAuction lee con el Admin SDK, que se saltea firestore.rules —
  // replicamos el mismo gate de audience que imponen las reglas para que un
  // comprador retail no llegue a una subasta wholesale (precio, VIN, chapa)
  // solo por conocer su id. Staff/admin/finanzas ven todo, igual que las
  // reglas.
  if (user.role === 'buyer' && auction.audience !== (user.audience ?? 'retail')) notFound();

  // Semilla del dock para que no diga "Pujar" un instante antes de que llegue
  // el primer snapshot de Firestore cuando el comprador ya iba ganando. Se
  // manda solo el booleano: el uid de `auction.currentBidderUid` nunca sale
  // de este server component.
  const initialIAmLeading = auction.currentBidderUid === user.uid && auction.currentBid > 0;

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
        isBuyer={user.role === 'buyer'}
        initialIAmLeading={initialIAmLeading}
      />
    </>
  );
}
