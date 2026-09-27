import { describe, expect, it } from 'vitest';
import { dockState, type DockInput } from './dock-state';

const NOW = Date.parse('2026-09-27T15:00:00Z');
const H = 3_600_000;
const ME = 'uid-me';

const live = (over: Partial<DockInput> = {}): DockInput => ({
  status: 'live',
  startsAtMs: NOW - H,
  endsAtMs: NOW + 6 * H,
  currentBid: 0,
  currentBidderUid: null,
  ...over,
});

describe('dockState', () => {
  it('offers the next minimum bid while live and not leading', () => {
    expect(dockState(live(), ME, NOW, 9500)).toEqual({ kind: 'bid', amountUsd: 9500 });
    expect(
      dockState(live({ currentBid: 29000, currentBidderUid: 'uid-other' }), ME, NOW, 30000),
    ).toEqual({ kind: 'bid', amountUsd: 30000 });
  });

  it('says the buyer is winning, at the current bid, with no bid action', () => {
    // placeBid rechaza que el que va ganando vuelva a pujar, así que no hay "Subir puja".
    expect(dockState(live({ currentBid: 29000, currentBidderUid: ME }), ME, NOW, 30000)).toEqual({
      kind: 'winning',
      amountUsd: 29000,
    });
  });

  it('does not treat a leader without a bid amount as winning', () => {
    expect(dockState(live({ currentBidderUid: ME }), ME, NOW, 9500)).toEqual({
      kind: 'bid',
      amountUsd: 9500,
    });
  });

  it('counts down to the opening while scheduled', () => {
    expect(
      dockState(live({ status: 'scheduled', startsAtMs: NOW + 2 * H }), ME, NOW, 14500),
    ).toEqual({ kind: 'scheduled', opensInMs: 2 * H });
  });

  it('never counts below zero when the opening tick is late', () => {
    expect(
      dockState(live({ status: 'scheduled', startsAtMs: NOW - 1000 }), ME, NOW, 14500),
    ).toEqual({ kind: 'scheduled', opensInMs: 0 });
  });

  it('hides once the clock ran out, even before the status flips', () => {
    expect(dockState(live({ endsAtMs: NOW }), ME, NOW, 9500)).toEqual({ kind: 'hidden' });
    expect(dockState(live({ endsAtMs: NOW - 1 }), ME, NOW, 9500)).toEqual({ kind: 'hidden' });
  });

  it('hides for ended and cancelled auctions', () => {
    expect(dockState(live({ status: 'ended' }), ME, NOW, 9500)).toEqual({ kind: 'hidden' });
    expect(dockState(live({ status: 'cancelled' }), ME, NOW, 9500)).toEqual({ kind: 'hidden' });
  });
});
