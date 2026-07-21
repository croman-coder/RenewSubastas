import 'server-only';
import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

export interface ViewerEntry {
  uid: string;
  name: string; // "Ana G."
  viewCount: number;
  lastViewAtMs: number;
}

export interface PriceChangeEntry {
  field: string;
  from: number | null;
  to: number | null;
  isReduction: boolean;
  actorName: string;
  atMs: number;
}

export interface AuctionSummary {
  id: string;
  status: string;
  outcome: string | null;
  finalPrice: number | null;
  startingPrice: number;
  endsAtMs: number;
  viewsTotal: number;
  viewsUnique: number;
}

export interface VehicleInsight {
  vehicleId: string;
  make: string;
  model: string;
  year: number;
  status: string;
  daysListed: number | null;
  unsoldAlert: boolean;
  auctions: AuctionSummary[];
  viewers: ViewerEntry[];
  priceChanges: PriceChangeEntry[];
}

const DAY_MS = 24 * 3600_000;

export async function loadVehicleInsight(vehicleId: string): Promise<VehicleInsight | null> {
  const db = getFirestore(getAdminApp());
  const now = Date.now();

  const vSnap = await db.doc(`vehicles/${vehicleId}`).get();
  if (!vSnap.exists) return null;
  const v = vSnap.data()!;

  const auctionsSnap = await db
    .collection('auctions')
    .where('vehicleId', '==', vehicleId)
    .orderBy('createdAt', 'desc')
    .limit(20)
    .get();

  const auctions: AuctionSummary[] = auctionsSnap.docs.map((d) => {
    const a = d.data();
    const vs = (a['viewStats'] ?? {}) as { total?: number; unique?: number };
    return {
      id: d.id,
      status: (a['status'] as string) ?? '',
      outcome: (a['outcome'] as string | undefined) ?? null,
      finalPrice: (a['finalPrice'] as number | undefined) ?? null,
      startingPrice: (a['startingPrice'] as number) ?? 0,
      endsAtMs: (a['endsAt'] as Timestamp).toMillis(),
      viewsTotal: vs.total ?? 0,
      viewsUnique: vs.unique ?? 0,
    };
  });

  // Merge viewers across the vehicle's auctions by uid: a buyer who viewed two
  // listings of the same car is one person — sum their views, keep the latest
  // visit. (Also avoids duplicate React keys on the page.)
  const viewersByUid = new Map<string, ViewerEntry>();
  const priceChanges: PriceChangeEntry[] = [];
  await Promise.all(
    auctionsSnap.docs.map(async (aDoc) => {
      const [vwSnap, pcSnap] = await Promise.all([
        aDoc.ref.collection('viewers').orderBy('lastViewAt', 'desc').limit(200).get(),
        aDoc.ref.collection('priceChanges').orderBy('at', 'desc').limit(100).get(),
      ]);
      for (const d of vwSnap.docs) {
        const w = d.data();
        const uid = (w['uid'] as string) ?? d.id;
        const lastViewAtMs = (w['lastViewAt'] as Timestamp).toMillis();
        const viewCount = (w['viewCount'] as number) ?? 0;
        const existing = viewersByUid.get(uid);
        if (existing) {
          existing.viewCount += viewCount;
          if (lastViewAtMs > existing.lastViewAtMs) {
            existing.lastViewAtMs = lastViewAtMs;
            existing.name = `${w['firstName'] ?? ''} ${w['lastInitial'] ?? ''}.`.trim();
          }
        } else {
          viewersByUid.set(uid, {
            uid,
            name: `${w['firstName'] ?? ''} ${w['lastInitial'] ?? ''}.`.trim(),
            viewCount,
            lastViewAtMs,
          });
        }
      }
      for (const d of pcSnap.docs) {
        const c = d.data();
        priceChanges.push({
          field: (c['field'] as string) ?? '',
          from: (c['from'] as number | null) ?? null,
          to: (c['to'] as number | null) ?? null,
          isReduction: Boolean(c['isReduction']),
          actorName: (c['actorName'] as string) ?? '',
          atMs: (c['at'] as Timestamp).toMillis(),
        });
      }
    }),
  );
  const viewers = [...viewersByUid.values()].sort((a, b) => b.lastViewAtMs - a.lastViewAtMs);
  priceChanges.sort((a, b) => b.atMs - a.atMs);

  const listedAt = v['firstListedAt'] as Timestamp | undefined;
  const daysListed = listedAt ? Math.floor((now - listedAt.toMillis()) / DAY_MS) : null;
  const sold = v['status'] === 'sold' || v['status'] === 'archived';

  return {
    vehicleId,
    make: (v['make'] as string) ?? '',
    model: (v['model'] as string) ?? '',
    year: (v['year'] as number) ?? 0,
    status: (v['status'] as string) ?? '',
    daysListed,
    unsoldAlert: daysListed !== null && daysListed >= 7 && !sold,
    auctions,
    viewers,
    priceChanges,
  };
}
