import { describe, expect, it } from 'vitest';
import { needsRelistLookup, publicAuctionState } from './public-state';

const NOW = Date.parse('2026-10-02T12:00:00Z');
const FUTURE = NOW + 3_600_000;
const PAST = NOW - 3_600_000;

describe('publicAuctionState (spec §6)', () => {
  it('a scheduled auction is indexable', () => {
    expect(
      publicAuctionState({ status: 'scheduled', outcome: null, endsAtMs: FUTURE }, null, NOW),
    ).toEqual({
      kind: 'scheduled',
      indexable: true,
    });
  });

  it('a live auction is indexable while its clock runs', () => {
    expect(
      publicAuctionState({ status: 'live', outcome: null, endsAtMs: FUTURE }, null, NOW),
    ).toEqual({
      kind: 'live',
      indexable: true,
    });
  });

  it('a live auction past its close, before the tick flips it, is finished with the result pending', () => {
    expect(
      publicAuctionState({ status: 'live', outcome: null, endsAtMs: PAST }, null, NOW),
    ).toEqual({
      kind: 'finished',
      result: 'pending',
      indexable: false,
    });
  });

  it('a sale while its lote is still open shows the SOLD band, not indexable', () => {
    expect(
      publicAuctionState({ status: 'ended', outcome: 'sold', endsAtMs: FUTURE }, null, NOW),
    ).toEqual({
      kind: 'sold-visible',
      indexable: false,
    });
  });

  it('a showroom sale counts as sold too', () => {
    expect(
      publicAuctionState({ status: 'ended', outcome: 'sold_offline', endsAtMs: FUTURE }, null, NOW)
        .kind,
    ).toBe('sold-visible');
  });

  it('a sale whose lote closed is finished as sold', () => {
    expect(
      publicAuctionState({ status: 'ended', outcome: 'sold', endsAtMs: PAST }, null, NOW),
    ).toEqual({
      kind: 'finished',
      result: 'sold',
      indexable: false,
    });
  });

  it('an unsold auction whose vehicle is back on auction redirects there', () => {
    expect(
      publicAuctionState({ status: 'ended', outcome: 'no_bids', endsAtMs: PAST }, 'auc-2', NOW),
    ).toEqual({
      kind: 'redirect',
      toAuctionId: 'auc-2',
      indexable: false,
    });
  });

  it('an unsold auction without a new one is finished as unsold', () => {
    expect(
      publicAuctionState(
        { status: 'ended', outcome: 'reserve_not_met', endsAtMs: PAST },
        null,
        NOW,
      ),
    ).toEqual({ kind: 'finished', result: 'unsold', indexable: false });
  });

  it('a cancelled auction redirects if relisted, otherwise says it was cancelled', () => {
    expect(
      publicAuctionState({ status: 'cancelled', outcome: null, endsAtMs: PAST }, 'auc-3', NOW).kind,
    ).toBe('redirect');
    expect(
      publicAuctionState({ status: 'cancelled', outcome: null, endsAtMs: PAST }, null, NOW),
    ).toEqual({
      kind: 'finished',
      result: 'cancelled',
      indexable: false,
    });
  });
});

describe('needsRelistLookup', () => {
  it('only asks for unsold or cancelled auctions', () => {
    expect(needsRelistLookup({ status: 'ended', outcome: 'no_bids', endsAtMs: PAST })).toBe(true);
    expect(needsRelistLookup({ status: 'cancelled', outcome: null, endsAtMs: PAST })).toBe(true);
    expect(needsRelistLookup({ status: 'ended', outcome: 'sold', endsAtMs: PAST })).toBe(false);
    expect(needsRelistLookup({ status: 'live', outcome: null, endsAtMs: FUTURE })).toBe(false);
    expect(needsRelistLookup({ status: 'scheduled', outcome: null, endsAtMs: FUTURE })).toBe(false);
  });
});
