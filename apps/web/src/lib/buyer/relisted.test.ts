import { describe, expect, it } from 'vitest';
import { pickRelistedAuction } from './relisted';

describe('pickRelistedAuction', () => {
  it('ignores the current auction and closed ones', () => {
    expect(
      pickRelistedAuction(
        [
          { id: 'auc-1', status: 'ended', audience: 'retail', endsAtMs: 1 },
          { id: 'auc-0', status: 'ended', audience: 'retail', endsAtMs: 2 },
        ],
        'auc-1',
      ),
    ).toBeNull();
  });

  it('never points a public page at a wholesale auction', () => {
    expect(
      pickRelistedAuction(
        [{ id: 'auc-2', status: 'live', audience: 'wholesale', endsAtMs: 5 }],
        'auc-1',
      ),
    ).toBeNull();
  });

  it('prefers a live auction over a scheduled one', () => {
    expect(
      pickRelistedAuction(
        [
          { id: 'auc-sched', status: 'scheduled', audience: 'retail', endsAtMs: 10 },
          { id: 'auc-live', status: 'live', endsAtMs: 20 },
        ],
        'auc-1',
      ),
    ).toBe('auc-live');
  });

  it('among two open ones of the same status, picks the one closing first', () => {
    expect(
      pickRelistedAuction(
        [
          { id: 'auc-late', status: 'scheduled', audience: 'retail', endsAtMs: 30 },
          { id: 'auc-soon', status: 'scheduled', audience: 'retail', endsAtMs: 10 },
        ],
        'auc-1',
      ),
    ).toBe('auc-soon');
  });
});
