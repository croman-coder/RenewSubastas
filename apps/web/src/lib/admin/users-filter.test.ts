import { describe, it, expect } from 'vitest';
import { isUsersKind, isUsersStatus, usersEqualityFilters } from './users-filter';

describe('isUsersKind', () => {
  it('accepts every valid kind', () => {
    for (const v of ['admin', 'staff', 'finanzas', 'buyer', 'retail', 'wholesale']) {
      expect(isUsersKind(v)).toBe(true);
    }
  });

  it('rejects undefined, empty string, and garbage values', () => {
    expect(isUsersKind(undefined)).toBe(false);
    expect(isUsersKind('')).toBe(false);
    expect(isUsersKind('all')).toBe(false);
    expect(isUsersKind('Retail')).toBe(false); // case-sensitive
    expect(isUsersKind('__proto__')).toBe(false);
  });
});

describe('isUsersStatus', () => {
  it('accepts active and disabled', () => {
    expect(isUsersStatus('active')).toBe(true);
    expect(isUsersStatus('disabled')).toBe(true);
  });

  it('rejects undefined, empty string, and garbage values', () => {
    expect(isUsersStatus(undefined)).toBe(false);
    expect(isUsersStatus('')).toBe(false);
    expect(isUsersStatus('all')).toBe(false);
    expect(isUsersStatus('Active')).toBe(false);
  });
});

// Every row below is a distinct Firestore query shape (field-path
// combination) the /admin/users list can produce. Each one that includes 2+
// fields needs its own composite index alongside createdAt — see the
// firestore.indexes.json cross-reference in users-filter.ts's docstring.
describe('usersEqualityFilters', () => {
  it('"Todos" (no kind, no status) applies no filters — automatic index only', () => {
    expect(usersEqualityFilters(undefined, undefined)).toEqual([]);
  });

  it('status alone → [status] (existing status+createdAt index)', () => {
    expect(usersEqualityFilters(undefined, 'active')).toEqual([
      { field: 'status', value: 'active' },
    ]);
    expect(usersEqualityFilters(undefined, 'disabled')).toEqual([
      { field: 'status', value: 'disabled' },
    ]);
  });

  it.each(['admin', 'staff', 'finanzas', 'buyer'] as const)(
    'role kind "%s" alone → [role] (existing role+createdAt index)',
    (kind) => {
      expect(usersEqualityFilters(kind, undefined)).toEqual([{ field: 'role', value: kind }]);
    },
  );

  it.each(['admin', 'staff', 'finanzas', 'buyer'] as const)(
    'role kind "%s" + status → [role, status] (existing role+status+createdAt index)',
    (kind) => {
      expect(usersEqualityFilters(kind, 'active')).toEqual([
        { field: 'role', value: kind },
        { field: 'status', value: 'active' },
      ]);
    },
  );

  it.each(['retail', 'wholesale'] as const)(
    'audience kind "%s" alone → [role=buyer, profile.audience] (NEW role+profile.audience+createdAt index)',
    (kind) => {
      expect(usersEqualityFilters(kind, undefined)).toEqual([
        { field: 'role', value: 'buyer' },
        { field: 'profile.audience', value: kind },
      ]);
    },
  );

  it.each(['retail', 'wholesale'] as const)(
    'audience kind "%s" + status → [role=buyer, profile.audience, status] (NEW role+profile.audience+status+createdAt index)',
    (kind) => {
      expect(usersEqualityFilters(kind, 'disabled')).toEqual([
        { field: 'role', value: 'buyer' },
        { field: 'profile.audience', value: kind },
        { field: 'status', value: 'disabled' },
      ]);
    },
  );

  it('never emits a profile.audience filter without a paired role=buyer filter', () => {
    for (const kind of ['admin', 'staff', 'finanzas', 'buyer', 'retail', 'wholesale'] as const) {
      for (const status of [undefined, 'active', 'disabled'] as const) {
        const filters = usersEqualityFilters(kind, status);
        const hasAudience = filters.some((f) => f.field === 'profile.audience');
        if (hasAudience) {
          expect(filters).toContainEqual({ field: 'role', value: 'buyer' });
        }
      }
    }
  });
});
