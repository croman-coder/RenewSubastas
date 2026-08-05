import { describe, it, expect } from 'vitest';
import { batchClock } from './batch';

const item = (status: string, startsAtMs: number, endsAtMs: number) => ({
  status,
  startsAtMs,
  endsAtMs,
});

describe('batchClock', () => {
  it('counts to the soonest close while anything is live', () => {
    expect(
      batchClock([item('live', 100, 5_000), item('live', 100, 3_000), item('live', 100, 9_000)]),
    ).toEqual({ at: 3_000, mode: 'closing' });
  });

  it('falls back to the next opening when nothing is live', () => {
    expect(
      batchClock([item('scheduled', 8_000, 20_000), item('scheduled', 6_000, 20_000)]),
    ).toEqual({ at: 6_000, mode: 'opening' });
  });

  it('prefers a running lote over a queued one', () => {
    // A scheduled lote opening sooner than the live one closes must not win:
    // while bidding is open, the deadline is what matters.
    expect(batchClock([item('live', 0, 9_000), item('scheduled', 1_000, 50_000)])).toEqual({
      at: 9_000,
      mode: 'closing',
    });
  });

  it('returns null with neither a running nor a queued lote', () => {
    expect(batchClock([])).toBeNull();
    expect(batchClock([item('ended', 1, 2), item('cancelled', 1, 2)])).toBeNull();
  });

  it('ignores records missing the timestamp it would count to', () => {
    // A live auction with no endsAt would otherwise drag the minimum to 0
    // and render a permanently-closed clock.
    expect(batchClock([item('live', 100, 0), item('live', 100, 4_000)])).toEqual({
      at: 4_000,
      mode: 'closing',
    });
    expect(batchClock([item('live', 100, 0)])).toBeNull();
    expect(batchClock([item('scheduled', 0, 5_000)])).toBeNull();
  });
});
