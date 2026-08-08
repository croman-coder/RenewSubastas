import { describe, it, expect } from 'vitest';
import { isCredentialBearingPath } from './meta-pixel';

describe('isCredentialBearingPath', () => {
  it('blocks the two routes that carry a secret in the query string', () => {
    expect(isCredentialBearingPath('/es/auth/set-password')).toBe(true);
    expect(isCredentialBearingPath('/es/auth/action')).toBe(true);
  });

  it('blocks them without a locale prefix, in case middleware has not redirected yet', () => {
    expect(isCredentialBearingPath('/auth/set-password')).toBe(true);
    expect(isCredentialBearingPath('/auth/action')).toBe(true);
  });

  it('tolerates a trailing slash', () => {
    expect(isCredentialBearingPath('/es/auth/action/')).toBe(true);
  });

  it('blocks nested children so a future sub-route cannot reopen the leak', () => {
    expect(isCredentialBearingPath('/es/auth/action/confirm')).toBe(true);
  });

  it('allows every ordinary page, including the login page next to them', () => {
    for (const path of ['/es', '/es/login', '/es/subastas', '/es/terminos', '/es/cookies', '/']) {
      expect(isCredentialBearingPath(path)).toBe(false);
    }
  });
});
