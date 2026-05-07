import 'server-only';
import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

export interface BuyerStats {
  /** Number of auctions currently `live` (everyone sees the same number; it's the catalog size). */
  liveAuctions: number;
  /** Number of auctions `scheduled` (about to open). */
  scheduledAuctions: number;
  /** Number of auctions `ended` (regardless of outcome). */
  endedAuctions: number;
  /** Auctions where this buyer is currently the top bidder. */
  myWinningCount: number;
  /** Auctions where this buyer placed at least one bid. */
  myActiveBidsCount: number;
  /** Total auctions this buyer has won (status=ended, outcome=sold, winnerUid=me). */
  myWonCount: number;
  /** Sum of finalPrice for won auctions, USD. */
  myWonGmvUsd: number;
  /** Auctions favorited by this buyer that are still live. */
  myFavoritesLiveCount: number;
  /** Closing-soon auctions (live, ends within 24h), sorted asc, max 3. */
  closingSoon: Array<{
    id: string;
    make: string;
    model: string;
    year: number;
    thumbnailUrl: string | null;
    currentBid: number;
    startingPrice: number;
    endsAtMs: number;
  }>;
  /** Auctions where the buyer is currently winning. */
  myWinning: Array<{
    auctionId: string;
    make: string;
    model: string;
    year: number;
    thumbnailUrl: string | null;
    currentBid: number;
    endsAtMs: number;
  }>;
}

async function safeCount(p: Promise<{ data: () => { count: number } }>): Promise<number> {
  try {
    const s = await p;
    return s.data().count;
  } catch {
    return 0;
  }
}

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch {
    return fallback;
  }
}

export async function loadBuyerStats(
  uid: string,
  audience: 'retail' | 'wholesale',
): Promise<BuyerStats> {
  const db = getFirestore(getAdminApp());

  // Every auction count is scoped to the buyer's audience so a wholesale
  // user never sees retail inventory in their dashboard (and vice-versa).
  const a = (status: string) =>
    db
      .collection('auctions')
      .where('audience', '==', audience)
      .where('status', '==', status)
      .count()
      .get();

  // The "my winning / my won" buckets are post-filtered by audience because a
  // buyer who switched segments (or who bid before the audience field
  // existed) shouldn't keep seeing opposite-audience inventory in their
  // dashboard. Counts come from the same fetch so they always agree with the
  // visible list.
  const [liveAuctions, scheduledAuctions, endedAuctions, myWinningDocs, myWonDocs] =
    await Promise.all([
      safeCount(a('live')),
      safeCount(a('scheduled')),
      safeCount(a('ended')),
      safe(
        db
          .collection('auctions')
          .where('currentBidderUid', '==', uid)
          .where('status', '==', 'live')
          .get()
          .then((s) =>
            s.docs.filter((d) => {
              const docAudience =
                (d.data()['audience'] as 'retail' | 'wholesale' | undefined) ?? 'retail';
              return docAudience === audience;
            }),
          ),
        [] as FirebaseFirestore.QueryDocumentSnapshot[],
      ),
      safe(
        db
          .collection('auctions')
          .where('winnerUid', '==', uid)
          .where('status', '==', 'ended')
          .get()
          .then((s) =>
            s.docs.filter((d) => {
              const docAudience =
                (d.data()['audience'] as 'retail' | 'wholesale' | undefined) ?? 'retail';
              return docAudience === audience;
            }),
          ),
        [] as FirebaseFirestore.QueryDocumentSnapshot[],
      ),
    ]);
  const myWinningCount = myWinningDocs.length;
  const myWonCount = myWonDocs.length;
  const myWonGmvUsd = myWonDocs.reduce(
    (acc, d) => acc + ((d.data()['finalPrice'] as number | undefined) ?? 0),
    0,
  );

  // Distinct auctions the buyer has placed any bid on.
  const myActiveBidsCount = await safe(
    db
      .collectionGroup('bids')
      .where('buyerUid', '==', uid)
      .select('auctionId')
      .get()
      .then((snap) => {
        const ids = new Set<string>();
        snap.docs.forEach((d) => {
          const aid = d.data()['auctionId'] as string | undefined;
          if (aid) ids.add(aid);
        });
        return ids.size;
      }),
    0,
  );

  // Favorites still live AND in the buyer's own audience. Bookmarks of
  // auctions that crossed audiences shouldn't keep counting.
  const myFavoritesLiveCount = await safe(
    (async () => {
      const userSnap = await db.doc(`users/${uid}`).get();
      const fav = (userSnap.data()?.['favorites'] as string[] | undefined) ?? [];
      if (fav.length === 0) return 0;
      const refs = fav.map((id) => db.doc(`auctions/${id}`));
      const docs = await db.getAll(...refs);
      return docs.filter((d) => {
        if (!d.exists) return false;
        const data = d.data() ?? {};
        const docAudience = (data['audience'] as 'retail' | 'wholesale' | undefined) ?? 'retail';
        return data['status'] === 'live' && docAudience === audience;
      }).length;
    })(),
    0,
  );

  // Closing-soon: live auctions ending in next 24h, max 3 (lighter than admin).
  // Filtered to the buyer's audience so wholesale buyers don't see retail
  // closings and vice-versa.
  const now = Date.now();
  const in24h = Timestamp.fromMillis(now + 24 * 3600_000);
  const closingSoon = await safe(
    db
      .collection('auctions')
      .where('audience', '==', audience)
      .where('status', '==', 'live')
      .where('endsAt', '<=', in24h)
      .orderBy('endsAt', 'asc')
      .limit(3)
      .get()
      .then((s) =>
        s.docs.map((d) => {
          const data = d.data();
          const v = (data['vehicleSnapshot'] ?? {}) as Record<string, unknown>;
          return {
            id: d.id,
            make: (v['make'] as string) ?? '',
            model: (v['model'] as string) ?? '',
            year: (v['year'] as number) ?? 0,
            thumbnailUrl: (v['thumbnailUrl'] as string | undefined) ?? null,
            currentBid: (data['currentBid'] as number) ?? 0,
            startingPrice: (data['startingPrice'] as number) ?? 0,
            endsAtMs:
              (data['endsAt'] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0,
          };
        }),
      ),
    [] as BuyerStats['closingSoon'],
  );

  // Auctions the buyer is currently winning, scoped to their audience and
  // capped at 5 for the dashboard panel. Reuses myWinningDocs so the count
  // and the visible list stay in sync.
  const myWinning: BuyerStats['myWinning'] = myWinningDocs.slice(0, 5).map((d) => {
    const data = d.data();
    const v = (data['vehicleSnapshot'] ?? {}) as Record<string, unknown>;
    return {
      auctionId: d.id,
      make: (v['make'] as string) ?? '',
      model: (v['model'] as string) ?? '',
      year: (v['year'] as number) ?? 0,
      thumbnailUrl: (v['thumbnailUrl'] as string | undefined) ?? null,
      currentBid: (data['currentBid'] as number) ?? 0,
      endsAtMs: (data['endsAt'] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0,
    };
  });

  return {
    liveAuctions,
    scheduledAuctions,
    endedAuctions,
    myWinningCount,
    myActiveBidsCount,
    myWonCount,
    myWonGmvUsd,
    myFavoritesLiveCount,
    closingSoon,
    myWinning,
  };
}
