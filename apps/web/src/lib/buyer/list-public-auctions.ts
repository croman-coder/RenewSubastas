import 'server-only';
import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore, type Query } from 'firebase-admin/firestore';

export interface PublicAuction {
  id: string;
  vehicleId: string;
  make: string;
  model: string;
  year: number;
  thumbnailUrl: string | null;
  startingPrice: number;
  currentBid: number;
  bidCount: number;
  status: 'scheduled' | 'live' | 'ended' | 'cancelled';
  startsAtMs: number;
  endsAtMs: number;
}

export type CatalogTab = 'all' | 'closing' | 'favorites';

export interface ListPublicAuctionsArgs {
  tab: CatalogTab;
  favorites?: string[];
  pageSize?: number;
}

export async function listPublicAuctions({
  tab,
  favorites = [],
  pageSize = 50,
}: ListPublicAuctionsArgs): Promise<PublicAuction[]> {
  const db = getFirestore(getAdminApp());

  if (tab === 'favorites') {
    if (favorites.length === 0) return [];
    // Firestore `in` accepts up to 30 ids; chunk if needed.
    const chunks: string[][] = [];
    for (let i = 0; i < favorites.length; i += 30) {
      chunks.push(favorites.slice(i, i + 30));
    }
    const results: PublicAuction[] = [];
    for (const chunk of chunks) {
      const refs = chunk.map((id) => db.doc(`auctions/${id}`));
      const docs = await db.getAll(...refs);
      docs
        .filter((d) => d.exists)
        .forEach((d) => results.push(toItem(d as FirebaseFirestore.QueryDocumentSnapshot)));
    }
    return results.sort((a, b) => a.endsAtMs - b.endsAtMs);
  }

  // 'all' and 'closing' both filter to live + scheduled auctions, ordered by endsAt asc.
  let q: Query = db
    .collection('auctions')
    .where('status', 'in', ['live', 'scheduled'])
    .orderBy('endsAt', 'asc')
    .limit(pageSize);

  if (tab === 'closing') {
    const in24h = new Date(Date.now() + 24 * 3600_000);
    q = db
      .collection('auctions')
      .where('status', '==', 'live')
      .where('endsAt', '<=', in24h)
      .orderBy('endsAt', 'asc')
      .limit(pageSize);
  }

  const snap = await q.get();
  return snap.docs.map(toItem);
}

function toItem(d: FirebaseFirestore.QueryDocumentSnapshot): PublicAuction {
  const data = d.data();
  const v = (data['vehicleSnapshot'] ?? {}) as Record<string, unknown>;
  const ms = (k: string) => (data[k] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
  return {
    id: d.id,
    vehicleId: (data['vehicleId'] as string) ?? '',
    make: (v['make'] as string) ?? '',
    model: (v['model'] as string) ?? '',
    year: (v['year'] as number) ?? 0,
    thumbnailUrl: (v['thumbnailUrl'] as string | undefined) ?? null,
    startingPrice: (data['startingPrice'] as number) ?? 0,
    currentBid: (data['currentBid'] as number) ?? 0,
    bidCount: (data['bidCount'] as number) ?? 0,
    status: (data['status'] as PublicAuction['status']) ?? 'scheduled',
    startsAtMs: ms('startsAt'),
    endsAtMs: ms('endsAt'),
  };
}
