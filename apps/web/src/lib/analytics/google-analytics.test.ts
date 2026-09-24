import { describe, it, expect } from 'vitest';
import { isGoogleAnalyticsExcludedPath, isInternalPath, whatsappLinkUrl } from './google-analytics';

describe('isInternalPath', () => {
  it('matches the three staff areas, with or without locale and nested', () => {
    for (const path of ['/es/admin', '/en/admin/config', '/es/staff/bids', '/es/sales', '/admin']) {
      expect(isInternalPath(path)).toBe(true);
    }
  });

  it('leaves buyer and public pages alone', () => {
    for (const path of [
      '/es',
      '/',
      '/es/login',
      '/es/retail',
      '/es/auctions/abc',
      '/es/settings',
    ]) {
      expect(isInternalPath(path)).toBe(false);
    }
  });

  it('only looks at the first segment after the locale', () => {
    expect(isInternalPath('/es/auctions/admin')).toBe(false);
  });
});

describe('isGoogleAnalyticsExcludedPath', () => {
  it('excludes internal routes and the credential-bearing ones', () => {
    expect(isGoogleAnalyticsExcludedPath('/es/admin/users')).toBe(true);
    expect(isGoogleAnalyticsExcludedPath('/es/auth/set-password')).toBe(true);
    expect(isGoogleAnalyticsExcludedPath('/es/auth/action')).toBe(true);
  });

  it('measures the landing, auth and legal pages', () => {
    for (const path of ['/es', '/en', '/es/login', '/es/register', '/es/terminos', '/es/cookies']) {
      expect(isGoogleAnalyticsExcludedPath(path)).toBe(false);
    }
  });
});

describe('whatsappLinkUrl', () => {
  const base = 'https://renewsubastas.com.py/es';

  it('recognises wa.me and whatsapp.com, dropping the prefilled text', () => {
    expect(whatsappLinkUrl('https://wa.me/595981000000?text=hola', base)).toBe(
      'https://wa.me/595981000000',
    );
    expect(whatsappLinkUrl('https://api.whatsapp.com/send?phone=595981000000', base)).toBe(
      'https://api.whatsapp.com/send',
    );
    expect(whatsappLinkUrl('whatsapp://send?phone=595981000000', base)).toBe('whatsapp:');
  });

  it('ignores everything else, including lookalike hosts', () => {
    expect(whatsappLinkUrl('/es/login', base)).toBeNull();
    expect(whatsappLinkUrl('https://evilwhatsapp.com/x', base)).toBeNull();
    expect(whatsappLinkUrl('mailto:ventas@santarosa.com.py', base)).toBeNull();
    expect(whatsappLinkUrl('http://[bad', base)).toBeNull();
  });
});
