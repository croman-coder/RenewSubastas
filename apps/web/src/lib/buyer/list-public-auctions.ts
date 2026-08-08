import 'server-only';
import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore, type Query } from 'firebase-admin/firestore';
import { isVisibleInCatalog } from './catalog-visibility';

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
  outcome: 'sold' | 'reserve_not_met' | 'no_bids' | 'sold_offline' | null;
}

export type CatalogTab = 'all' | 'closing' | 'favorites';

export interface ListPublicAuctionsArgs {
  tab: CatalogTab;
  /** Filter to a single audience. Buyers always pass their own audience here. */
  audience: 'retail' | 'wholesale';
  favorites?: string[];
  pageSize?: number;
}

export async function listPublicAuctions({
  tab,
  audience,
  favorites = [],
  pageSize = 50,
}: ListPublicAuctionsArgs): Promise<PublicAuction[]> {
  const db = getFirestore(getAdminApp());

  if (tab === 'favorites') {
    if (favorites.length === 0) return [];
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
        .forEach((d) => {
          // Even favorites are filtered by audience: a buyer who bookmarked an
          // auction that later got moved to the other segment shouldn't keep
          // seeing it.
          const docAudience =
            (d.data()?.['audience'] as 'retail' | 'wholesale' | undefined) ?? 'retail';
          if (docAudience !== audience) return;
          results.push(toItem(d as FirebaseFirestore.QueryDocumentSnapshot));
        });
    }
    return results.sort((a, b) => a.endsAtMs - b.endsAtMs);
  }

  if (tab === 'closing') {
    const in24h = new Date(Date.now() + 24 * 3600_000);
    const q: Query = db
      .collection('auctions')
      .where('audience', '==', audience)
      .where('status', '==', 'live')
      .where('endsAt', '<=', in24h)
      .orderBy('endsAt', 'asc')
      .limit(pageSize);
    const snap = await q.get();
    return snap.docs.map(toItem);
  }

  // Las vendidas siguen visibles con su franja hasta que el lote al que
  // pertenecían vence — sirve de prueba social de que se venden autos.
  // Firestore no admite OR sobre campos distintos en una sola query, así
  // que se traen ambos conjuntos y se ordenan en memoria (el lote es de
  // decenas de unidades, no miles). Qué cuenta como "todavía visible" es
  // responsabilidad de isVisibleInCatalog, no de esta query — ver ese
  // archivo para el porqué.
  const nowMs = Date.now();
  const [openSnap, soldSnap] = await Promise.all([
    db
      .collection('auctions')
      .where('audience', '==', audience)
      .where('status', 'in', ['live', 'scheduled'])
      .orderBy('endsAt', 'asc')
      .limit(pageSize)
      .get(),
    db
      .collection('auctions')
      .where('audience', '==', audience)
      .where('status', '==', 'ended')
      .where('endsAt', '>', new Date(nowMs))
      .orderBy('endsAt', 'asc')
      .limit(pageSize)
      .get(),
  ]);
  return [...openSnap.docs, ...soldSnap.docs]
    .map(toItem)
    .filter((a) => isVisibleInCatalog(a, nowMs))
    .sort((a, b) => a.endsAtMs - b.endsAtMs)
    .slice(0, pageSize);
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
    outcome: (data['outcome'] as PublicAuction['outcome']) ?? null,
  };
}
