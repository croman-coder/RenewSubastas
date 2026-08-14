import 'server-only';
import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore } from 'firebase-admin/firestore';
import type { Role, Audience } from '@/lib/auth/constants';
import { usersEqualityFilters, type UsersKind, type UsersStatus } from './users-filter';

export interface UserListItem {
  uid: string;
  email: string;
  role: Role;
  audience: Audience | null;
  status: UsersStatus;
  firstName: string;
  lastName: string;
  documentType: 'CI' | 'RUC';
  documentNumber: string;
  createdAt: number;
}

export interface ListUsersFilter {
  kind?: UsersKind;
  status?: UsersStatus;
  pageSize?: number;
  cursor?: string;
}

export interface ListUsersResult {
  items: UserListItem[];
  nextCursor: string | null;
  /**
   * Count of the full filtered set — every user matching `kind`/`status`,
   * not just the documents in `items`. Independent of pagination: computed
   * via a separate, unlimited `count()` aggregation so a `cursor`/`pageSize`
   * on the list query can never make this look like "this page has N".
   */
  totalCount: number;
}

/**
 * Hard ceiling on a single export. The `/admin/users` export streams every
 * matching user into one in-memory file, so it needs *some* bound; 5000 rows
 * is far above the real user base and still a small file. When a query hits
 * the cap the export says so on its cover line rather than silently handing
 * over a partial list — see `usersExportSubtitle`.
 */
export const EXPORT_MAX_USERS = 5000;

function withEqualityFilters(
  base: FirebaseFirestore.Query,
  kind: UsersKind | undefined,
  status: UsersStatus | undefined,
): FirebaseFirestore.Query {
  return usersEqualityFilters(kind, status).reduce(
    (acc, f) => acc.where(f.field, '==', f.value),
    base,
  );
}

export async function listUsers(filter: ListUsersFilter): Promise<ListUsersResult> {
  const db = getFirestore(getAdminApp());

  let q = withEqualityFilters(
    db.collection('users').orderBy('createdAt', 'desc'),
    filter.kind,
    filter.status,
  );
  const pageSize = Math.min(filter.pageSize ?? 25, 100);
  if (filter.cursor) {
    const cursorMs = Number(filter.cursor);
    if (!Number.isNaN(cursorMs)) q = q.startAfter(new Date(cursorMs));
  }
  q = q.limit(pageSize + 1);

  // Deliberately a fresh query with the same equality filters but no
  // orderBy/cursor/limit: count() respects `.limit()` on the query it's
  // called on, so reusing `q` here would cap the count at `pageSize + 1`
  // instead of reporting the full filtered set. Dropping the orderBy also
  // means this never needs its own composite index — see users-filter.ts.
  const countQuery = withEqualityFilters(db.collection('users'), filter.kind, filter.status);

  const [snap, countSnap] = await Promise.all([q.get(), countQuery.count().get()]);
  const docs = snap.docs;
  const hasMore = docs.length > pageSize;
  const items: UserListItem[] = docs.slice(0, pageSize).map(toUserListItem);
  const nextCursor = hasMore ? String(items[items.length - 1]!.createdAt) : null;
  return { items, nextCursor, totalCount: countSnap.data().count };
}

/**
 * Every user matching the filters, unpaginated — the export's data source.
 *
 * Deliberately not `listUsers` in a loop: that would page with a `createdAt`
 * cursor, and two accounts created in the same millisecond (a scripted import,
 * a bulk seed) sit exactly on a `startAfter` boundary, where one of them gets
 * skipped. A single ordered query has no boundary to fall through. It reuses
 * the same filter+orderBy shapes as the list query, so it needs no index the
 * list page does not already have.
 */
export async function listAllUsers(
  filter: Pick<ListUsersFilter, 'kind' | 'status'>,
  max: number = EXPORT_MAX_USERS,
): Promise<UserListItem[]> {
  const db = getFirestore(getAdminApp());
  const q = withEqualityFilters(
    db.collection('users').orderBy('createdAt', 'desc'),
    filter.kind,
    filter.status,
  );
  const snap = await q.limit(max).get();
  return snap.docs.map(toUserListItem);
}

function toUserListItem(d: FirebaseFirestore.QueryDocumentSnapshot): UserListItem {
  const data = d.data();
  const profile = (data['profile'] ?? {}) as Record<string, unknown>;
  const createdAt =
    (data['createdAt'] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
  const role = (data['role'] as Role) ?? 'buyer';
  return {
    uid: d.id,
    email: (data['email'] as string) ?? '',
    role,
    // Audience only carries meaning for buyers. For admin/staff/finanzas we
    // explicitly expose null so the table can render "—" instead of a
    // stale value. Missing profile.audience on a legacy buyer defaults to
    // 'retail' for display, matching homeFor()'s fallback in
    // lib/auth/constants.ts — but note the Retail *filter* in
    // users-filter.ts queries profile.audience == 'retail' directly, which
    // a doc with the field entirely absent will NOT match. See the
    // write-up in docs/superpowers/notes/2026-08-10-usuarios-audiencia.md.
    audience: role === 'buyer' ? ((profile['audience'] as Audience | undefined) ?? 'retail') : null,
    status: (data['status'] as UsersStatus) ?? 'active',
    firstName: (profile['firstName'] as string) ?? '',
    lastName: (profile['lastName'] as string) ?? '',
    documentType: (profile['documentType'] as 'CI' | 'RUC') ?? 'CI',
    documentNumber: (profile['documentNumber'] as string) ?? '',
    createdAt,
  };
}
