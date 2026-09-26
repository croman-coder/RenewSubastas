/**
 * Lo que un visitante anónimo puede ver de una subasta (spec 2026-09-26 §4).
 *
 * Una lista cerrada a propósito: el test compara las claves del objeto contra
 * PUBLIC_AUCTION_KEYS, así que agregar un campo significa tocar el test y
 * decidir, en el acto, si es publicable. VIN, patente, pujas, espectadores,
 * reserva, pagos y ganador nunca pertenecen acá.
 */
export type PublicAuctionStatus = 'scheduled' | 'live' | 'ended' | 'cancelled';
export type PublicAuctionOutcome = 'sold' | 'reserve_not_met' | 'no_bids' | 'sold_offline' | null;

export interface PublicAuctionDetail {
  id: string;
  vehicleId: string;
  make: string;
  model: string;
  year: number;
  mileage: number | null;
  transmission: 'manual' | 'automatic' | 'cvt';
  fuelType: 'gasoline' | 'diesel' | 'hybrid' | 'electric';
  color: string | null;
  condition: 'new' | 'used' | 'damaged';
  descriptionEs: string;
  descriptionEn: string | null;
  images: Array<{ url: string; thumbnailUrl: string }>;
  startingPrice: number;
  currentBid: number;
  bidCount: number;
  bidIncrement: number;
  buyNowPrice: number | null;
  status: PublicAuctionStatus;
  outcome: PublicAuctionOutcome;
  startsAtMs: number;
  endsAtMs: number;
}

export const PUBLIC_AUCTION_KEYS = [
  'id',
  'vehicleId',
  'make',
  'model',
  'year',
  'mileage',
  'transmission',
  'fuelType',
  'color',
  'condition',
  'descriptionEs',
  'descriptionEn',
  'images',
  'startingPrice',
  'currentBid',
  'bidCount',
  'bidIncrement',
  'buyNowPrice',
  'status',
  'outcome',
  'startsAtMs',
  'endsAtMs',
] as const satisfies readonly (keyof PublicAuctionDetail)[];

type Doc = Record<string, unknown>;

function millis(d: Doc, key: string): number {
  return (d[key] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
}

/** Nulo para subastas wholesale: ese segmento es cerrado y nunca público. */
export function toPublicAuctionDetail(id: string, a: Doc, v: Doc): PublicAuctionDetail | null {
  const audience = (a['audience'] as string | undefined) ?? 'retail';
  if (audience !== 'retail') return null;
  const description = (v['description'] ?? {}) as { es?: string; en?: string };
  const images = (v['images'] as Array<{ url?: string; thumbnailUrl?: string }> | undefined) ?? [];
  return {
    id,
    vehicleId: (a['vehicleId'] as string | undefined) ?? '',
    make: (v['make'] as string | undefined) ?? '',
    model: (v['model'] as string | undefined) ?? '',
    year: (v['year'] as number | undefined) ?? 0,
    mileage: (v['mileage'] as number | undefined) ?? null,
    transmission:
      (v['transmission'] as PublicAuctionDetail['transmission'] | undefined) ?? 'manual',
    fuelType: (v['fuelType'] as PublicAuctionDetail['fuelType'] | undefined) ?? 'gasoline',
    color: (v['color'] as string | undefined) ?? null,
    condition: (v['condition'] as PublicAuctionDetail['condition'] | undefined) ?? 'used',
    descriptionEs: description.es ?? '',
    descriptionEn: description.en ?? null,
    images: images
      .filter((img): img is { url: string; thumbnailUrl?: string } => Boolean(img.url))
      .map((img) => ({ url: img.url, thumbnailUrl: img.thumbnailUrl ?? img.url })),
    startingPrice: (a['startingPrice'] as number | undefined) ?? 0,
    currentBid: (a['currentBid'] as number | undefined) ?? 0,
    bidCount: (a['bidCount'] as number | undefined) ?? 0,
    bidIncrement: (a['bidIncrement'] as number | undefined) ?? 500,
    buyNowPrice: (a['buyNowPrice'] as number | undefined) ?? null,
    status: (a['status'] as PublicAuctionStatus | undefined) ?? 'scheduled',
    outcome: (a['outcome'] as PublicAuctionOutcome | undefined) ?? null,
    startsAtMs: millis(a, 'startsAt'),
    endsAtMs: millis(a, 'endsAt'),
  };
}

/** El único link de una subasta, para todos (spec §2). */
export function auctionPath(locale: string, id: string): `/${string}` {
  return `/${locale}/auctions/${id}`;
}
