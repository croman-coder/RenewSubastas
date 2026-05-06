import 'server-only';
import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore } from 'firebase-admin/firestore';

export interface MyBidEntry {
  bidId: string;
  auctionId: string;
  vehicleId: string;
  make: string;
  model: string;
  year: number;
  thumbnailUrl: string | null;
  myBid: number;
  status: 'winning' | 'outbid' | 'rejected' | 'valid';
  auctionStatus: 'scheduled' | 'live' | 'ended' | 'cancelled';
  outcome: 'sold' | 'reserve_not_met' | 'no_bids' | null;
  iAmWinner: boolean;
  currentBid: number;
  endsAtMs: number;
  bidCreatedAtMs: number;
}

export async function listMyBids(uid: string): Promise<MyBidEntry[]> {
  const db = getFirestore(getAdminApp());
  // Collection group query across all bids subcollections
  const bidsSnap = await db
    .collectionGroup('bids')
    .where('buyerUid', '==', uid)
    .orderBy('createdAt', 'desc')
    .limit(200)
    .get();

  // Hydrate each with the parent auction
  const auctionIds = Array.from(new Set(bidsSnap.docs.map((d) => d.ref.parent.parent!.id)));
  const auctionDocs: Record<string, FirebaseFirestore.DocumentData> = {};
  if (auctionIds.length > 0) {
    const refs = auctionIds.map((id) => db.doc(`auctions/${id}`));
    const fetched = await db.getAll(...refs);
    fetched.forEach((d) => {
      if (d.exists) auctionDocs[d.id] = d.data()!;
    });
  }

  return bidsSnap.docs.map((d) => {
    const bid = d.data();
    const auctionId = d.ref.parent.parent!.id;
    const a = auctionDocs[auctionId] ?? {};
    const v = (a['vehicleSnapshot'] ?? {}) as Record<string, unknown>;
    const ms = (k: string) => (a[k] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
    return {
      bidId: d.id,
      auctionId,
      vehicleId: (a['vehicleId'] as string) ?? '',
      make: (v['make'] as string) ?? '',
      model: (v['model'] as string) ?? '',
      year: (v['year'] as number) ?? 0,
      thumbnailUrl: (v['thumbnailUrl'] as string | undefined) ?? null,
      myBid: (bid['amount'] as number) ?? 0,
      status: (bid['status'] as MyBidEntry['status']) ?? 'valid',
      auctionStatus: (a['status'] as MyBidEntry['auctionStatus']) ?? 'ended',
      outcome: (a['outcome'] as MyBidEntry['outcome']) ?? null,
      iAmWinner: (a['winnerUid'] as string | undefined) === uid,
      currentBid: (a['currentBid'] as number) ?? 0,
      endsAtMs: ms('endsAt'),
      bidCreatedAtMs:
        (bid['createdAt'] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0,
    };
  });
}
