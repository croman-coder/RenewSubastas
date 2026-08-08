import { describe, it, expect } from 'vitest';
import { isSoldOutcome } from './sold-outcome';

describe('isSoldOutcome', () => {
  it('is true for a platform sale', () => {
    expect(isSoldOutcome('sold')).toBe(true);
  });

  it('is true for a showroom sale', () => {
    expect(isSoldOutcome('sold_offline')).toBe(true);
  });

  it('is false when the reserve was not met', () => {
    expect(isSoldOutcome('reserve_not_met')).toBe(false);
  });

  it('is false when there were no bids', () => {
    expect(isSoldOutcome('no_bids')).toBe(false);
  });

  it('is false when outcome has not been written yet', () => {
    expect(isSoldOutcome(null)).toBe(false);
  });
});
