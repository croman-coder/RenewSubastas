import 'server-only';
import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore } from 'firebase-admin/firestore';

export interface AuctionListItem {
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
  startsAt: number;
  endsAt: number;
  createdBy: string;
}

export interface ListAuctionsFilter {
  scopedToUid?: string;
  status?: AuctionListItem['status'];
  pageSize?: number;
  cursor?: string;
}

export interface ListAuctionsResult {
  items: AuctionListItem[];
  nextCursor: string | null;
}

export async function listAuctions(filter: ListAuctionsFilter): Promise<ListAuctionsResult> {
  const db = getFirestore(getAdminApp());
  let q: FirebaseFirestore.Query = db.collection('auctions').orderBy('updatedAt', 'desc');
  if (filter.scopedToUid) q = q.where('createdBy', '==', filter.scopedToUid);
  if (filter.status) q = q.where('status', '==', filter.status);
  const pageSize = Math.min(filter.pageSize ?? 25, 100);
  if (filter.cursor) {
    const ms = Number(filter.cursor);
    if (!Number.isNaN(ms)) q = q.startAfter(new Date(ms));
  }
  q = q.limit(pageSize + 1);
  // A missing composite index (or a not-yet-built one) returns FAILED_PRECONDITION;
  // returning an empty page keeps the UI rendering instead of crashing the route.
  let snap: FirebaseFirestore.QuerySnapshot;
  try {
    snap = await q.get();
  } catch (err) {
    console.warn('[listAuctions] query failed, returning empty page', err);
    return { items: [], nextCursor: null };
  }
  const docs = snap.docs;
  const hasMore = docs.length > pageSize;
  const items: AuctionListItem[] = docs.slice(0, pageSize).map((d) => {
    const data = d.data();
    const v = (data['vehicleSnapshot'] ?? {}) as Record<string, unknown>;
    const ms = (key: string) =>
      (data[key] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
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
      status: (data['status'] as AuctionListItem['status']) ?? 'scheduled',
      startsAt: ms('startsAt'),
      endsAt: ms('endsAt'),
      createdBy: (data['createdBy'] as string) ?? '',
    };
  });
  const nextCursor = hasMore ? String(items[items.length - 1]!.startsAt) : null;
  return { items, nextCursor };
}
