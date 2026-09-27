import type { Metadata } from 'next';
import type { PublicAuctionDetail } from '@/lib/buyer/public-auction';
import type { PublicAuctionState } from '@/lib/auctions/public-state';
import { formatAmount, formatNumber } from '@/lib/format/money';
import { formatDateTimePy } from '@/lib/format/date';
import { DEFAULT_LOCALE, INDEXED_LOCALES, SITE_URL } from './site';

/** Etiquetas ya traducidas por el llamador (next-intl vive en la página). */
export interface VehicleLabels {
  fuel: string;
  transmission: string;
}

const url = (locale: string, id: string) => `${SITE_URL}/${locale}/auctions/${id}`;

export function auctionTitle(d: PublicAuctionDetail): string {
  return `${d.make} ${d.model} ${d.year} en subasta · Renew Subastas`;
}

export function auctionDescription(
  d: PublicAuctionDetail,
  labels: VehicleLabels,
  state: PublicAuctionState,
): string {
  const km = d.mileage !== null ? `, ${formatNumber(d.mileage)} km` : '';
  const price =
    d.currentBid > 0
      ? `Puja actual USD ${formatAmount(d.currentBid)}`
      : `Precio de salida USD ${formatAmount(d.startingPrice)}`;
  const when =
    state.kind === 'scheduled'
      ? ` Abre el ${formatDateTimePy('es', d.startsAtMs)}.`
      : state.kind === 'live'
        ? ` Cierra el ${formatDateTimePy('es', d.endsAtMs)}.`
        : ' Subasta finalizada.';
  // "Certificado" solo se puede afirmar de un usado: dicho de un 0 km o de un
  // vehículo con daños sería una afirmación falsa (riesgo legal señalado en la
  // revisión del 26/9/2026).
  const certified = d.condition === 'used' ? ' Vehículo usado certificado por Santa Rosa.' : '';
  return `${d.make} ${d.model} ${d.year}${km}, ${labels.fuel.toLowerCase()}, ${labels.transmission.toLowerCase()}. ${price}.${when}${certified}`;
}

/** La condición real del vehículo en schema.org, no siempre "usado". */
const ITEM_CONDITION: Record<PublicAuctionDetail['condition'], string> = {
  new: 'https://schema.org/NewCondition',
  used: 'https://schema.org/UsedCondition',
  damaged: 'https://schema.org/DamagedCondition',
};

export function auctionMetadata(
  d: PublicAuctionDetail,
  labels: VehicleLabels,
  state: PublicAuctionState,
  locale: string,
): Metadata {
  const title = auctionTitle(d);
  const description = auctionDescription(d, labels, state);
  return {
    title,
    description,
    alternates: {
      canonical: url(locale, d.id),
      languages: Object.fromEntries([
        ...INDEXED_LOCALES.map((l) => [l, url(l, d.id)]),
        ['x-default', url(DEFAULT_LOCALE, d.id)],
      ]),
    },
    openGraph: {
      type: 'website',
      siteName: 'Renew Subastas',
      title,
      description,
      url: url(locale, d.id),
      locale: locale === 'en' ? 'en_US' : 'es_PY',
    },
    twitter: { card: 'summary_large_image', title, description },
    // Las subastas finalizadas, vendidas o redirigidas se excluyen del índice (spec §6).
    ...(state.indexable ? {} : { robots: { index: false, follow: true } }),
  };
}

export function vehicleJsonLd(
  d: PublicAuctionDetail,
  labels: VehicleLabels,
  state: PublicAuctionState,
  locale: string,
): Record<string, unknown> {
  const sold =
    state.kind === 'sold-visible' || (state.kind === 'finished' && state.result === 'sold');
  // Terminada sin venta (sin vender, cancelada o con el resultado por
  // confirmar): no hay nada en oferta, así que no va `offers`. Antes decía
  // InStock con precio en una página que avisa que la subasta terminó. La
  // vendida conserva su SoldOut.
  const hasOffer = sold || state.kind !== 'finished';
  const availability = sold
    ? 'https://schema.org/SoldOut'
    : state.kind === 'scheduled'
      ? 'https://schema.org/PreOrder'
      : 'https://schema.org/InStock';
  return {
    '@context': 'https://schema.org',
    '@type': 'Car',
    name: `${d.make} ${d.model} ${d.year}`,
    brand: { '@type': 'Brand', name: d.make },
    model: d.model,
    vehicleModelDate: String(d.year),
    ...(d.mileage !== null
      ? { mileageFromOdometer: { '@type': 'QuantitativeValue', value: d.mileage, unitCode: 'KMT' } }
      : {}),
    fuelType: labels.fuel,
    vehicleTransmission: labels.transmission,
    ...(d.color ? { color: d.color } : {}),
    itemCondition: ITEM_CONDITION[d.condition],
    image: d.images.slice(0, 5).map((img) => img.url),
    url: url(locale, d.id),
    ...(hasOffer
      ? {
          offers: {
            '@type': 'Offer',
            price: d.currentBid > 0 ? d.currentBid : d.startingPrice,
            priceCurrency: 'USD',
            availability,
            priceValidUntil: new Date(d.endsAtMs).toISOString().slice(0, 10),
            url: url(locale, d.id),
            seller: { '@type': 'Organization', name: 'Renew Subastas' },
          },
        }
      : {}),
  };
}
