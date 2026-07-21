import 'server-only';
import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

export interface VehicleInsightRow {
  vehicleId: string;
  make: string;
  model: string;
  year: number;
  thumbnailUrl: string | null;
  status: string;
  /** Days since first listing; null when never listed. */
  daysListed: number | null;
  /** ≥7 days listed and not sold/archived. */
  unsoldAlert: boolean;
  viewsTotal: number;
  viewsUnique: number;
  priceReductions: number;
  /** Latest auction's current/final price (USD), null when no auction yet. */
  currentPrice: number | null;
}

const DAY_MS = 24 * 3600_000;

/**
 * One row per vehicle for /staff/insights. Reads vehicles + all their
 * auctions in two queries and aggregates in memory — inventory is small
 * (hundreds), so this stays cheap and index-free.
 */
export async function loadInsights(): Promise<VehicleInsightRow[]> {
  const db = getFirestore(getAdminApp());
  const now = Date.now();

  const [vehiclesSnap, auctionsSnap] = await Promise.all([
    db.collection('vehicles').orderBy('createdAt', 'desc').limit(300).get(),
    db.collection('auctions').orderBy('createdAt', 'desc').limit(1000).get(),
  ]);

  // Group auctions by vehicle.
  const byVehicle = new Map<string, FirebaseFirestore.DocumentData[]>();
  for (const doc of auctionsSnap.docs) {
    const a = doc.data();
    const vid = a['vehicleId'] as string;
    const list = byVehicle.get(vid) ?? [];
    list.push(a);
    byVehicle.set(vid, list);
  }

  // Price reductions per vehicle: map each priceChanges hit to its parent
  // auction (already fetched) to find the vehicleId.
  const reductionsByVehicle = new Map<string, number>();
  const pcSnap = await db.collectionGroup('priceChanges').where('isReduction', '==', true).get();
  for (const doc of pcSnap.docs) {
    const auctionRef = doc.ref.parent.parent;
    if (!auctionRef) continue;
    const auction = auctionsSnap.docs.find((a) => a.id === auctionRef.id)?.data();
    const vid = auction?.['vehicleId'] as string | undefined;
    if (!vid) continue;
    reductionsByVehicle.set(vid, (reductionsByVehicle.get(vid) ?? 0) + 1);
  }

  const rows: VehicleInsightRow[] = vehiclesSnap.docs.map((doc) => {
    const v = doc.data();
    const auctions = byVehicle.get(doc.id) ?? [];
    const listedAt = v['firstListedAt'] as Timestamp | undefined;
    const daysListed = listedAt ? Math.floor((now - listedAt.toMillis()) / DAY_MS) : null;
    const sold = v['status'] === 'sold' || v['status'] === 'archived';

    // images is an array of { url, thumbnailUrl, order }; pick the first entry's thumbnailUrl.
    const images = v['images'] as Array<{ thumbnailUrl?: string }> | undefined;
    const thumbnailUrl = images?.[0]?.thumbnailUrl ?? null;

    let viewsTotal = 0;
    let viewsUnique = 0;
    for (const a of auctions) {
      const vs = (a['viewStats'] ?? {}) as { total?: number; unique?: number };
      viewsTotal += vs.total ?? 0;
      viewsUnique += vs.unique ?? 0;
    }
    const latest = auctions[0];
    const currentPrice = latest
      ? ((latest['finalPrice'] as number | undefined) ??
        ((latest['currentBid'] as number) > 0
          ? (latest['currentBid'] as number)
          : (latest['startingPrice'] as number)))
      : null;

    return {
      vehicleId: doc.id,
      make: (v['make'] as string) ?? '',
      model: (v['model'] as string) ?? '',
      year: (v['year'] as number) ?? 0,
      thumbnailUrl,
      status: (v['status'] as string) ?? '',
      daysListed,
      unsoldAlert: daysListed !== null && daysListed >= 7 && !sold,
      viewsTotal,
      viewsUnique,
      priceReductions: reductionsByVehicle.get(doc.id) ?? 0,
      currentPrice,
    };
  });

  // Alerted first, then most days listed.
  rows.sort(
    (x, y) =>
      Number(y.unsoldAlert) - Number(x.unsoldAlert) || (y.daysListed ?? -1) - (x.daysListed ?? -1),
  );
  return rows;
}
