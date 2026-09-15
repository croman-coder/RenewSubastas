import { describe, it, expect } from 'vitest';
import { mfaEnrollPath, sessionOutcome } from './session-outcome';

describe('sessionOutcome', () => {
  it('enters on success', () => {
    expect(sessionOutcome({ ok: true, role: 'buyer', audience: 'retail' })).toEqual({
      kind: 'enter',
      role: 'buyer',
      audience: 'retail',
    });
  });

  it('sends an un-enrolled staff account to enrolment (keeping the client session)', () => {
    expect(sessionOutcome({ ok: false, error: 'mfa_required', enrolled: false })).toEqual({
      kind: 'enroll_mfa',
    });
  });

  it('asks for a fresh sign-in when the account HAS a factor but the token did not prove it', () => {
    expect(sessionOutcome({ ok: false, error: 'mfa_required', enrolled: true })).toEqual({
      kind: 'reauth_mfa',
    });
  });

  it('treats mfa_required without the enrolled flag as "go enrol" — the safe direction', () => {
    // An older server build, or a stripped body: sending the user to enrol
    // is recoverable (the page tells them if they already have one); a
    // sign-out loop is not.
    expect(sessionOutcome({ ok: false, error: 'mfa_required' })).toEqual({ kind: 'enroll_mfa' });
  });

  it('passes every other error through untouched', () => {
    for (const error of [
      'account_disabled',
      'server_misconfigured',
      'forbidden_origin',
      'generic',
    ]) {
      expect(sessionOutcome({ ok: false, error })).toEqual({ kind: 'error', error });
    }
  });
});

describe('mfaEnrollPath', () => {
  it('carries the destination through, encoded', () => {
    expect(mfaEnrollPath('es', '/staff/insights?p=7d')).toBe(
      '/es/auth/mfa/enroll?from=%2Fstaff%2Finsights%3Fp%3D7d',
    );
  });
  it('has no query when there is nowhere to return to', () => {
    expect(mfaEnrollPath('es', undefined)).toBe('/es/auth/mfa/enroll');
  });
});
