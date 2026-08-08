import { describe, it, expect } from 'vitest';
import { isVisibleInCatalog } from './catalog-visibility';

const NOW = 1_000_000;
const FUTURE = NOW + 3600_000;
const PAST = NOW - 3600_000;

const item = (status: string, outcome: string | null, endsAtMs: number) => ({
  status,
  outcome,
  endsAtMs,
});

describe('isVisibleInCatalog', () => {
  it('includes a live auction regardless of outcome/endsAt', () => {
    expect(isVisibleInCatalog(item('live', null, PAST), NOW)).toBe(true);
  });

  it('includes a scheduled auction regardless of outcome/endsAt', () => {
    expect(isVisibleInCatalog(item('scheduled', null, PAST), NOW)).toBe(true);
  });

  it('includes an ended sold auction while its lote has not closed', () => {
    expect(isVisibleInCatalog(item('ended', 'sold', FUTURE), NOW)).toBe(true);
  });

  it('includes an ended sold_offline auction while its lote has not closed', () => {
    expect(isVisibleInCatalog(item('ended', 'sold_offline', FUTURE), NOW)).toBe(true);
  });

  it('excludes an ended sold auction once its lote has closed', () => {
    expect(isVisibleInCatalog(item('ended', 'sold', PAST), NOW)).toBe(false);
  });

  it('excludes an ended sold_offline auction once its lote has closed', () => {
    expect(isVisibleInCatalog(item('ended', 'sold_offline', PAST), NOW)).toBe(false);
  });

  it('excludes an ended reserve_not_met auction even while its lote has not closed', () => {
    expect(isVisibleInCatalog(item('ended', 'reserve_not_met', FUTURE), NOW)).toBe(false);
  });

  it('excludes an ended no_bids auction even while its lote has not closed', () => {
    expect(isVisibleInCatalog(item('ended', 'no_bids', FUTURE), NOW)).toBe(false);
  });

  it('excludes an ended auction with no outcome at all', () => {
    expect(isVisibleInCatalog(item('ended', null, FUTURE), NOW)).toBe(false);
  });

  it('treats endsAt exactly equal to now as already closed (strict >, matching the Firestore query)', () => {
    expect(isVisibleInCatalog(item('ended', 'sold', NOW), NOW)).toBe(false);
  });
});
