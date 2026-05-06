import 'server-only';
import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore } from 'firebase-admin/firestore';

export interface UserListItem {
  uid: string;
  email: string;
  role: 'admin' | 'staff' | 'buyer';
  audience: 'retail' | 'wholesale' | null;
  status: 'active' | 'disabled';
  firstName: string;
  lastName: string;
  documentType: 'CI' | 'RUC';
  documentNumber: string;
  createdAt: number;
}

export interface ListUsersFilter {
  role?: 'admin' | 'staff' | 'buyer';
  status?: 'active' | 'disabled';
  pageSize?: number;
  cursor?: string;
}

export interface ListUsersResult {
  items: UserListItem[];
  nextCursor: string | null;
}

export async function listUsers(filter: ListUsersFilter): Promise<ListUsersResult> {
  const db = getFirestore(getAdminApp());
  let q: FirebaseFirestore.Query = db.collection('users').orderBy('createdAt', 'desc');
  if (filter.role) q = q.where('role', '==', filter.role);
  if (filter.status) q = q.where('status', '==', filter.status);
  const pageSize = Math.min(filter.pageSize ?? 25, 100);
  if (filter.cursor) {
    const cursorMs = Number(filter.cursor);
    if (!Number.isNaN(cursorMs)) q = q.startAfter(new Date(cursorMs));
  }
  q = q.limit(pageSize + 1);

  const snap = await q.get();
  const docs = snap.docs;
  const hasMore = docs.length > pageSize;
  const items: UserListItem[] = docs.slice(0, pageSize).map((d) => {
    const data = d.data();
    const profile = (data['profile'] ?? {}) as Record<string, unknown>;
    const createdAt =
      (data['createdAt'] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
    const role = (data['role'] as 'admin' | 'staff' | 'buyer') ?? 'buyer';
    return {
      uid: d.id,
      email: (data['email'] as string) ?? '',
      role,
      // Audience only carries meaning for buyers. For admin/staff we explicitly
      // expose null so the table can render "—" instead of a stale value.
      audience:
        role === 'buyer'
          ? ((profile['audience'] as 'retail' | 'wholesale' | undefined) ?? 'retail')
          : null,
      status: (data['status'] as 'active' | 'disabled') ?? 'active',
      firstName: (profile['firstName'] as string) ?? '',
      lastName: (profile['lastName'] as string) ?? '',
      documentType: (profile['documentType'] as 'CI' | 'RUC') ?? 'CI',
      documentNumber: (profile['documentNumber'] as string) ?? '',
      createdAt,
    };
  });
  const nextCursor = hasMore ? String(items[items.length - 1]!.createdAt) : null;
  return { items, nextCursor };
}
