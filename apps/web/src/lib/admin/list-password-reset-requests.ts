import 'server-only';
import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore } from 'firebase-admin/firestore';

export interface PasswordResetRequestItem {
  id: string;
  email: string;
  uid: string;
  firstName: string;
  lastName: string;
  status: 'pending' | 'resolved';
  requestedAtMs: number;
  requestCount: number;
}

export interface ListResult {
  items: PasswordResetRequestItem[];
}

/**
 * Returns up to `limit` password reset requests, optionally filtered by
 * status. Server-side only — uses the admin SDK so we bypass the Firestore
 * rules that already restrict reads to admin users (the auth gate happens
 * in the calling page via requireRole).
 */
export async function listPasswordResetRequests(
  filter: { status?: 'pending' | 'resolved'; limit?: number } = {},
): Promise<ListResult> {
  const db = getFirestore(getAdminApp());
  let q: FirebaseFirestore.Query = db
    .collection('password_reset_requests')
    .orderBy('requestedAt', 'desc');
  if (filter.status) q = q.where('status', '==', filter.status);
  q = q.limit(filter.limit ?? 50);

  let snap: FirebaseFirestore.QuerySnapshot;
  try {
    snap = await q.get();
  } catch (err) {
    console.warn('[listPasswordResetRequests] query failed', err);
    return { items: [] };
  }

  const items: PasswordResetRequestItem[] = snap.docs.map((d) => {
    const data = d.data();
    const ts = (data['requestedAt'] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
    return {
      id: d.id,
      email: (data['email'] as string) ?? '',
      uid: (data['uid'] as string) ?? '',
      firstName: (data['firstName'] as string) ?? '',
      lastName: (data['lastName'] as string) ?? '',
      status: (data['status'] as 'pending' | 'resolved') ?? 'pending',
      requestedAtMs: ts,
      requestCount: (data['requestCount'] as number) ?? 1,
    };
  });

  return { items };
}
