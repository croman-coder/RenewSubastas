import { describe, it, expect } from 'vitest';
import { isValidRucPy, isValidCiPy, computeRucCheckDigit } from './paraguay';

describe('Paraguay RUC (mod 11 check digit)', () => {
  it('computes the check digit for a base number', () => {
    // We assert against the algorithm output for a known input.
    // The algorithm: weights 2..7 cycling right-to-left, sum, check = 11 - (sum % 11), if >=10 then 0.
    // For base "80012345": digits right-to-left are 5,4,3,2,1,0,0,8 with weights 2,3,4,5,6,7,2,3 → sum = 10+12+12+10+6+0+0+24 = 74; 74 % 11 = 8; 11 - 8 = 3.
    expect(computeRucCheckDigit('80012345')).toBe(3);
  });

  it('accepts a valid RUC formatted NNNNNNNN-D', () => {
    expect(isValidRucPy('80012345-3')).toBe(true);
  });

  it('rejects RUC with wrong check digit', () => {
    expect(isValidRucPy('80012345-0')).toBe(false);
  });

  it('rejects malformed RUC (no dash)', () => {
    expect(isValidRucPy('800123456')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidRucPy('')).toBe(false);
  });
});

describe('Paraguay CI (numeric, no check digit)', () => {
  it('accepts a 6-9 digit numeric CI', () => {
    expect(isValidCiPy('1234567')).toBe(true);
    expect(isValidCiPy('123456789')).toBe(true);
  });

  it('rejects letters', () => {
    expect(isValidCiPy('12345A7')).toBe(false);
  });

  it('rejects too short (< 5 digits)', () => {
    expect(isValidCiPy('1234')).toBe(false);
  });

  it('rejects too long (> 10 digits)', () => {
    expect(isValidCiPy('12345678901')).toBe(false);
  });
});
