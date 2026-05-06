import 'server-only';
import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore } from 'firebase-admin/firestore';

export interface AuctionDetail {
  id: string;
  vehicleId: string;
  make: string;
  model: string;
  year: number;
  vin: string | null;
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
  status: 'scheduled' | 'live' | 'ended' | 'cancelled';
  startsAtMs: number;
  endsAtMs: number;
}

export async function loadAuction(id: string): Promise<AuctionDetail | null> {
  const db = getFirestore(getAdminApp());
  const aSnap = await db.doc(`auctions/${id}`).get();
  if (!aSnap.exists) return null;
  const a = aSnap.data()!;

  const vSnap = await db.doc(`vehicles/${a['vehicleId']}`).get();
  const v = vSnap.exists ? vSnap.data()! : {};
  const description = (v['description'] ?? {}) as { es?: string; en?: string };
  const images = (v['images'] as Array<{ url: string; thumbnailUrl: string }> | undefined) ?? [];
  const ms = (k: string) => (a[k] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;

  return {
    id,
    vehicleId: (a['vehicleId'] as string) ?? '',
    make: (v['make'] as string) ?? '',
    model: (v['model'] as string) ?? '',
    year: (v['year'] as number) ?? 0,
    vin: (v['vin'] as string | undefined) ?? null,
    mileage: (v['mileage'] as number | undefined) ?? null,
    transmission: (v['transmission'] as AuctionDetail['transmission']) ?? 'manual',
    fuelType: (v['fuelType'] as AuctionDetail['fuelType']) ?? 'gasoline',
    color: (v['color'] as string | undefined) ?? null,
    condition: (v['condition'] as AuctionDetail['condition']) ?? 'used',
    descriptionEs: description.es ?? '',
    descriptionEn: description.en ?? null,
    images: images.map((img) => ({ url: img.url, thumbnailUrl: img.thumbnailUrl })),
    startingPrice: (a['startingPrice'] as number) ?? 0,
    currentBid: (a['currentBid'] as number) ?? 0,
    bidCount: (a['bidCount'] as number) ?? 0,
    bidIncrement: (a['bidIncrement'] as number) ?? 500,
    status: (a['status'] as AuctionDetail['status']) ?? 'scheduled',
    startsAtMs: ms('startsAt'),
    endsAtMs: ms('endsAt'),
  };
}
