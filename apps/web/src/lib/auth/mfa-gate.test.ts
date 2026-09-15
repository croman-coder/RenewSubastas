import { describe, it, expect } from 'vitest';
import { INTERNAL_ROLES, mfaGate, parseRequiredRoles } from './mfa-gate';

const STAFF = ['admin', 'staff', 'finanzas'];

describe('mfaGate', () => {
  it('is open for everyone when no role is required (the shipped default)', () => {
    for (const role of ['admin', 'staff', 'finanzas', 'buyer', null, undefined]) {
      expect(mfaGate({ role, secondFactor: undefined, requiredRoles: [] })).toBe('ok');
    }
  });

  it('requires a second factor for a listed role signing in with one factor', () => {
    expect(mfaGate({ role: 'admin', secondFactor: undefined, requiredRoles: STAFF })).toBe(
      'mfa_required',
    );
    expect(mfaGate({ role: 'staff', secondFactor: null, requiredRoles: STAFF })).toBe(
      'mfa_required',
    );
    expect(mfaGate({ role: 'finanzas', secondFactor: '', requiredRoles: STAFF })).toBe(
      'mfa_required',
    );
  });

  it('lets a listed role through when the token proves a second factor', () => {
    expect(mfaGate({ role: 'admin', secondFactor: 'totp', requiredRoles: STAFF })).toBe('ok');
    expect(mfaGate({ role: 'staff', secondFactor: 'phone', requiredRoles: STAFF })).toBe('ok');
  });

  it('never touches buyers, even when staff are required', () => {
    expect(mfaGate({ role: 'buyer', secondFactor: undefined, requiredRoles: STAFF })).toBe('ok');
  });

  it('never touches an account without a role claim', () => {
    // Legacy or half-provisioned account: the rest of the session route
    // already refuses it on status; this gate must not be what decides.
    expect(mfaGate({ role: null, secondFactor: undefined, requiredRoles: STAFF })).toBe('ok');
    expect(mfaGate({ role: undefined, secondFactor: undefined, requiredRoles: STAFF })).toBe('ok');
  });

  it('can be switched on for one role at a time', () => {
    expect(mfaGate({ role: 'admin', secondFactor: undefined, requiredRoles: ['admin'] })).toBe(
      'mfa_required',
    );
    expect(mfaGate({ role: 'staff', secondFactor: undefined, requiredRoles: ['admin'] })).toBe(
      'ok',
    );
  });

  it('judges the TOKEN, not the account: an enrolled user with a one-factor token is refused', () => {
    // There is no "enrolled" input on purpose — enrolment is not proof.
    expect(mfaGate({ role: 'admin', secondFactor: undefined, requiredRoles: STAFF })).toBe(
      'mfa_required',
    );
  });
});

describe('parseRequiredRoles', () => {
  it('passes a clean list through', () => {
    expect(parseRequiredRoles(['admin', 'staff'])).toEqual(['admin', 'staff']);
  });

  it('reads anything malformed as "nobody" — fail open for login, never fail closed', () => {
    expect(parseRequiredRoles(undefined)).toEqual([]);
    expect(parseRequiredRoles(null)).toEqual([]);
    expect(parseRequiredRoles('admin')).toEqual([]);
    expect(parseRequiredRoles({ admin: true })).toEqual([]);
  });

  it('drops non-string and blank entries but keeps the rest', () => {
    expect(parseRequiredRoles(['admin', 42, '', '  ', null, 'staff'])).toEqual(['admin', 'staff']);
  });

  it('INTERNAL_ROLES is exactly the three staff roles, never buyer', () => {
    expect([...INTERNAL_ROLES]).toEqual(['admin', 'staff', 'finanzas']);
  });
});
