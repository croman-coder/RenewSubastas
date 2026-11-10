import { describe, expect, it } from 'vitest';
import { isUnusuallyHighBid, UNUSUAL_BID_MULTIPLE } from './bid-sanity';

describe('isUnusuallyHighBid', () => {
  it('el caso del Sportage (110.000 con mínimo 14.000) es inusual', () => {
    expect(isUnusuallyHighBid(110_000, 14_000)).toBe(true);
  });

  it('pujas normales por encima del mínimo no lo son', () => {
    expect(isUnusuallyHighBid(14_000, 14_000)).toBe(false);
    expect(isUnusuallyHighBid(15_000, 14_000)).toBe(false);
    expect(isUnusuallyHighBid(27_999, 14_000)).toBe(false);
  });

  it('desde el múltiplo en adelante es inusual', () => {
    expect(UNUSUAL_BID_MULTIPLE).toBe(2);
    expect(isUnusuallyHighBid(28_000, 14_000)).toBe(true);
  });

  it('sin mínimo usable no marca nada', () => {
    expect(isUnusuallyHighBid(50_000, 0)).toBe(false);
    expect(isUnusuallyHighBid(50_000, Number.NaN)).toBe(false);
  });
});
