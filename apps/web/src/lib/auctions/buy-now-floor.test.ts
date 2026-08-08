import { describe, it, expect } from 'vitest';
import { isBuyNowBelowReserve } from './buy-now-floor';

describe('isBuyNowBelowReserve', () => {
  it('is false when both fields are blank', () => {
    expect(isBuyNowBelowReserve('', '')).toBe(false);
  });

  it('is false when buyNow is blank, even with a reserve present', () => {
    expect(isBuyNowBelowReserve('', '30000')).toBe(false);
  });

  it('is false when reserve is blank, even with a buyNow present — server enforces the startingPrice floor instead', () => {
    expect(isBuyNowBelowReserve('34000', '')).toBe(false);
  });

  it('is true when buyNow equals the reserve — the rule is strictly greater', () => {
    expect(isBuyNowBelowReserve('30000', '30000')).toBe(true);
  });

  it('is true when buyNow is below the reserve', () => {
    expect(isBuyNowBelowReserve('29000', '30000')).toBe(true);
  });

  it('is false when buyNow is above the reserve', () => {
    expect(isBuyNowBelowReserve('34000', '30000')).toBe(false);
  });
});
