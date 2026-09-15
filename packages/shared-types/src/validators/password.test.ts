import { describe, it, expect } from 'vitest';
import {
  PASSWORD_MIN_LEN,
  PasswordSchema,
  passwordIssues,
  PASSWORD_ISSUE_MESSAGE_ES,
} from './password.js';

describe('passwordIssues', () => {
  it('accepts the rule: 10+ chars, a lowercase letter, a digit', () => {
    expect(passwordIssues('renew2026ok')).toEqual([]);
    expect(passwordIssues('Carbid123!x')).toEqual([]);
    expect(passwordIssues('abcdefghi1')).toEqual([]); // exactly 10
  });

  it('reports every broken rule, in display order', () => {
    expect(passwordIssues('')).toEqual(['too_short', 'no_lowercase', 'no_digit']);
    expect(passwordIssues('ABCDEFGHIJ')).toEqual(['no_lowercase', 'no_digit']);
    expect(passwordIssues('1234567890')).toEqual(['no_lowercase']);
    expect(passwordIssues('abcdefghij')).toEqual(['no_digit']);
    expect(passwordIssues('abc123')).toEqual(['too_short']);
  });

  it('rejects the old 8-character passwords that used to pass elsewhere', () => {
    // change-password and reset-by-token accepted these before 2026-09-15.
    expect(passwordIssues('abcdefg1')).toEqual(['too_short']);
    expect(passwordIssues('12345678')).toEqual(['too_short', 'no_lowercase']);
  });

  it('treats an all-caps password the way Firebase will', () => {
    // Firebase's policy has no "any letter" option; this is why the rule says
    // lowercase, and why the form must say so too.
    expect(passwordIssues('PASSWORD2026')).toEqual(['no_lowercase']);
  });

  it('counts characters, not bytes: accents and emoji are fine', () => {
    expect(passwordIssues('contraseña9')).toEqual([]);
  });
});

describe('PasswordSchema', () => {
  it('passes a compliant password through unchanged', () => {
    expect(PasswordSchema.parse('renew2026ok')).toBe('renew2026ok');
  });

  it('fails with the FIRST broken rule as the message', () => {
    const r = PasswordSchema.safeParse('ABC');
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe(PASSWORD_ISSUE_MESSAGE_ES.too_short);
    const r2 = PasswordSchema.safeParse('ABCDEFGHIJK');
    if (!r2.success)
      expect(r2.error.issues[0]?.message).toBe(PASSWORD_ISSUE_MESSAGE_ES.no_lowercase);
  });

  it('caps length at Firebase s own limit', () => {
    expect(PasswordSchema.safeParse('a1'.repeat(2048)).success).toBe(true);
    expect(PasswordSchema.safeParse('a1'.repeat(2049)).success).toBe(false);
  });

  it('exposes the same minimum the copy quotes', () => {
    expect(PASSWORD_MIN_LEN).toBe(10);
    expect(PASSWORD_ISSUE_MESSAGE_ES.too_short).toContain('10');
  });
});
