import { describe, it, expect } from 'vitest';
import { didBuyerWinAuction } from './win-state';

const ME = 'buyer-me';
const OTHER = 'buyer-other';

describe('didBuyerWinAuction', () => {
  it('is true for the winnerUid on a sold auction', () => {
    expect(didBuyerWinAuction({ ended: true, outcome: 'sold', winnerUid: ME, myUid: ME })).toBe(
      true,
    );
  });

  it('is false for anyone else on a sold auction', () => {
    expect(didBuyerWinAuction({ ended: true, outcome: 'sold', winnerUid: OTHER, myUid: ME })).toBe(
      false,
    );
  });

  // The exact regression this replaces: a bidder who was leading when the
  // auction closed in the showroom must NOT be told they won.
  it('is false on sold_offline even for the last leading bidder', () => {
    expect(
      didBuyerWinAuction({ ended: true, outcome: 'sold_offline', winnerUid: null, myUid: ME }),
    ).toBe(false);
  });

  it('is false on reserve_not_met', () => {
    expect(
      didBuyerWinAuction({ ended: true, outcome: 'reserve_not_met', winnerUid: null, myUid: ME }),
    ).toBe(false);
  });

  it('is false on no_bids', () => {
    expect(
      didBuyerWinAuction({ ended: true, outcome: 'no_bids', winnerUid: null, myUid: ME }),
    ).toBe(false);
  });

  it('is false when outcome has not been written yet, even mid-name match', () => {
    expect(didBuyerWinAuction({ ended: true, outcome: null, winnerUid: ME, myUid: ME })).toBe(
      false,
    );
  });

  it('is false while the auction has not ended, even for the eventual winner', () => {
    expect(didBuyerWinAuction({ ended: false, outcome: 'sold', winnerUid: ME, myUid: ME })).toBe(
      false,
    );
  });
});
