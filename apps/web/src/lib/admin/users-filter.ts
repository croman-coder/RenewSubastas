import type { Role, Audience } from '@/lib/auth/constants';

export type UsersStatus = 'active' | 'disabled';

/**
 * The operator-facing filter value for `/admin/users`. Retail and Wholesale
 * are never their own `role` in Firestore — they're the `buyer` role plus
 * `profile.audience` — but they're folded in here as flat, independently
 * selectable options, mirroring the same "kind" concept already used by
 * `EditRoleForm`/`CreateUserForm` (`admin/users/[uid]/edit-role-form.tsx`,
 * `admin/users/new/create-user-form.tsx`) for the same role+audience
 * problem on a single account. `'buyer'` is kept as the combined
 * "retail + wholesale" option so existing bookmarked/linked filters keep
 * working and an operator can still see every buyer at once.
 */
export type UsersKind = Role | Audience;

const USERS_KINDS: readonly UsersKind[] = [
  'admin',
  'staff',
  'finanzas',
  'buyer',
  'retail',
  'wholesale',
];

const USERS_STATUSES: readonly UsersStatus[] = ['active', 'disabled'];

export function isUsersKind(value: string | undefined): value is UsersKind {
  return value !== undefined && (USERS_KINDS as readonly string[]).includes(value);
}

export function isUsersStatus(value: string | undefined): value is UsersStatus {
  return value !== undefined && (USERS_STATUSES as readonly string[]).includes(value);
}

export interface UsersEqualityFilter {
  field: 'role' | 'profile.audience' | 'status';
  value: string;
}

/**
 * Maps the (kind, status) filter pair to the exact ordered list of Firestore
 * equality `where()` clauses the query needs.
 *
 * This is the one place that decides which fields get filtered together —
 * pulled out as a pure function specifically so every combination the UI can
 * produce is enumerable and unit-testable without touching Firestore (the
 * loader that actually builds the query, `list-users.ts`, imports `'server-only'`
 * and can't be imported from a vitest test — see `catalog-visibility.ts` for
 * the same constraint on the buyer side).
 *
 * Every shape this can return needs a composite index alongside `createdAt`
 * for the paginated list query — see `firestore.indexes.json`. The `role`
 * and `status` combinations were already covered before this filter existed
 * (`role+createdAt`, `status+createdAt`, `role+status+createdAt`); adding
 * `retail`/`wholesale` introduces exactly two new shapes:
 *   - role + profile.audience
 *   - role + profile.audience + status
 * The count() aggregation in `list-users.ts` deliberately never sorts, so
 * none of these shapes need an index for the count — Firestore only
 * requires a composite index when a filter is combined with an orderBy (or
 * range) on a different field; pure equality-only filters resolve via the
 * automatic single-field indexes (the same reason
 * `notifications/sendAuctionLive.ts`'s `role`+`status`+`profile.audience`
 * query needs no dedicated index either).
 *
 * `retail`/`wholesale` always expand to `role=buyer` *and*
 * `profile.audience=<kind>` together — never `profile.audience` alone — so
 * selecting an audience can never accidentally also match a staff/admin/
 * finanzas account that happens to carry a stray `profile.audience` value.
 */
export function usersEqualityFilters(
  kind: UsersKind | undefined,
  status: UsersStatus | undefined,
): UsersEqualityFilter[] {
  const filters: UsersEqualityFilter[] = [];
  if (kind === 'retail' || kind === 'wholesale') {
    filters.push({ field: 'role', value: 'buyer' });
    filters.push({ field: 'profile.audience', value: kind });
  } else if (kind) {
    filters.push({ field: 'role', value: kind });
  }
  if (status) filters.push({ field: 'status', value: status });
  return filters;
}
