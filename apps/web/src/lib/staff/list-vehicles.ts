import 'server-only';
import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore } from 'firebase-admin/firestore';

export interface VehicleListItem {
  id: string;
  make: string;
  model: string;
  year: number;
  status: 'draft' | 'ready' | 'in_auction' | 'sold' | 'archived';
  thumbnailUrl: string | null;
  createdAt: number;
  createdBy: string;
}

export interface ListVehiclesFilter {
  scopedToUid?: string;
  status?: VehicleListItem['status'];
  pageSize?: number;
  cursor?: string;
}

export interface ListVehiclesResult {
  items: VehicleListItem[];
  nextCursor: string | null;
}

export async function listVehicles(filter: ListVehiclesFilter): Promise<ListVehiclesResult> {
  const db = getFirestore(getAdminApp());
  let q: FirebaseFirestore.Query = db.collection('vehicles').orderBy('updatedAt', 'desc');
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
    console.warn('[listVehicles] query failed, returning empty page', err);
    return { items: [], nextCursor: null };
  }
  const docs = snap.docs;
  const hasMore = docs.length > pageSize;
  const items: VehicleListItem[] = docs.slice(0, pageSize).map((d) => {
    const data = d.data();
    const updatedAt =
      (data['updatedAt'] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
    const images =
      (data['images'] as Array<{ thumbnailUrl?: string; url?: string }> | undefined) ?? [];
    const firstImg = images[0];
    return {
      id: d.id,
      make: (data['make'] as string) ?? '',
      model: (data['model'] as string) ?? '',
      year: (data['year'] as number) ?? 0,
      status: (data['status'] as VehicleListItem['status']) ?? 'draft',
      thumbnailUrl: firstImg?.thumbnailUrl ?? firstImg?.url ?? null,
      createdAt: updatedAt,
      createdBy: (data['createdBy'] as string) ?? '',
    };
  });
  const nextCursor = hasMore ? String(items[items.length - 1]!.createdAt) : null;
  return { items, nextCursor };
}
