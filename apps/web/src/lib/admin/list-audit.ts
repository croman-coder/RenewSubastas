import 'server-only';
import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore } from 'firebase-admin/firestore';

export interface AuditEntry {
  id: string;
  actorUid: string;
  action: string;
  resourceType: string;
  resourceId: string;
  createdAt: number;
}

export interface ListAuditFilter {
  action?: string;
  pageSize?: number;
  cursor?: string;
}

export interface ListAuditResult {
  items: AuditEntry[];
  nextCursor: string | null;
}

export async function listAudit(filter: ListAuditFilter): Promise<ListAuditResult> {
  const db = getFirestore(getAdminApp());
  let q: FirebaseFirestore.Query = db.collection('audit_logs').orderBy('createdAt', 'desc');
  if (filter.action) q = q.where('action', '==', filter.action);
  const pageSize = Math.min(filter.pageSize ?? 25, 100);
  if (filter.cursor) {
    const cursorMs = Number(filter.cursor);
    if (!Number.isNaN(cursorMs)) q = q.startAfter(new Date(cursorMs));
  }
  q = q.limit(pageSize + 1);

  const snap = await q.get();
  const docs = snap.docs;
  const hasMore = docs.length > pageSize;
  const items: AuditEntry[] = docs.slice(0, pageSize).map((d) => {
    const data = d.data();
    const createdAt =
      (data['createdAt'] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
    return {
      id: d.id,
      actorUid: (data['actorUid'] as string) ?? '',
      action: (data['action'] as string) ?? '',
      resourceType: (data['resourceType'] as string) ?? '',
      resourceId: (data['resourceId'] as string) ?? '',
      createdAt,
    };
  });
  const nextCursor = hasMore ? String(items[items.length - 1]!.createdAt) : null;
  return { items, nextCursor };
}
