import { describe, it, expect } from 'vitest';
import { sanitizeNamePart, deriveNameFromDisplayName } from './name.js';

describe('sanitizeNamePart', () => {
  it('strips digits and symbols, including an HTML/script-injection attempt', () => {
    const out = sanitizeNamePart('Ana<img src=x onerror=alert(1)>');
    expect(out).not.toMatch(/[<>=()0-9]/);
    expect(out.startsWith('Ana')).toBe(true);
  });

  it('strips digits from an ordinary string', () => {
    expect(sanitizeNamePart('Ana123')).toBe('Ana');
  });

  it('clamps to maxLen', () => {
    expect(sanitizeNamePart('a'.repeat(100))).toHaveLength(40);
  });

  it('keeps accented letters, apostrophes and hyphens', () => {
    expect(sanitizeNamePart("María José O'Brien-Gómez")).toBe("María José O'Brien-Gómez");
  });
});

describe('deriveNameFromDisplayName', () => {
  it('splits a two-word display name', () => {
    expect(deriveNameFromDisplayName('Ana Gomez', 'ana@example.com')).toEqual({
      firstName: 'Ana',
      lastName: 'Gomez',
    });
  });

  it('falls back to the email local-part when there is no display name', () => {
    expect(deriveNameFromDisplayName(undefined, 'carla@example.com')).toEqual({
      firstName: 'carla',
      lastName: '',
    });
  });

  it('falls back to "Usuario" when neither a display name nor a usable email exist', () => {
    expect(deriveNameFromDisplayName('', '')).toEqual({ firstName: 'Usuario', lastName: '' });
  });

  // Regression test: local-parts run up to 64 chars (RFC 5321) and can
  // contain characters NAME_RX rejects (dots, digits, plus-addressing).
  // Before the fix, this fallback bypassed sanitizeNamePart entirely, so a
  // long/dotted local-part landed in profile.firstName unclamped and
  // unsanitized — a value the buyer's own settings/profile form (max(40) +
  // NAME_RX) would then refuse to save, blocking them from editing their
  // own profile without ever having typed the offending value themselves.
  it('sanitizes AND clamps the email local-part fallback, not just the display-name path', () => {
    const longLocalPart = 'carlos.alberto.rodriguez.gonzalez.perez.martinez123456789';
    expect(longLocalPart.length).toBeGreaterThan(40);
    const { firstName } = deriveNameFromDisplayName(undefined, `${longLocalPart}@example.com`);
    // Before the fix this fallback bypassed sanitizeNamePart entirely, so
    // it stayed at its full 57 chars with digits intact.
    expect(firstName.length).toBeLessThanOrEqual(40);
    expect(firstName).not.toMatch(/\d/);
  });

  it('sanitizes disallowed characters out of the email local-part fallback', () => {
    const { firstName } = deriveNameFromDisplayName(undefined, 'ana+test_99@example.com');
    expect(firstName).toBe('anatest');
  });
});
