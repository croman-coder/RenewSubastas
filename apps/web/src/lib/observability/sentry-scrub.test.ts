import { describe, it, expect } from 'vitest';
import { scrubCredentialsFromUrl, scrubEventUrls } from './sentry-scrub';

describe('scrubCredentialsFromUrl', () => {
  it('redacts the reset token but keeps the path', () => {
    const out = scrubCredentialsFromUrl(
      'https://renewsubastas.com.py/es/auth/set-password?token=abc123def456',
    );
    expect(out).not.toContain('abc123def456');
    expect(out).toContain('/es/auth/set-password');
    expect(out).toContain('token=%5BFiltered%5D');
  });

  it('redacts the Firebase oobCode and leaves sibling params intact', () => {
    const out = scrubCredentialsFromUrl(
      'https://renewsubastas.com.py/es/auth/action?mode=resetPassword&oobCode=SECRET&lang=es',
    );
    expect(out).not.toContain('SECRET');
    expect(out).toContain('mode=resetPassword');
    expect(out).toContain('lang=es');
  });

  it('matches the param name case-insensitively', () => {
    expect(scrubCredentialsFromUrl('/es/auth/action?ooBcOdE=SECRET')).not.toContain('SECRET');
    expect(scrubCredentialsFromUrl('/es/auth/set-password?TOKEN=SECRET')).not.toContain('SECRET');
  });

  it('leaves ordinary URLs untouched, byte for byte', () => {
    const url = 'https://renewsubastas.com.py/es?utm_medium=paid&utm_source=ig&utm_id=1202';
    expect(scrubCredentialsFromUrl(url)).toBe(url);
  });

  it('handles a URL with no query string and an undefined URL', () => {
    expect(scrubCredentialsFromUrl('https://renewsubastas.com.py/es')).toBe(
      'https://renewsubastas.com.py/es',
    );
    expect(scrubCredentialsFromUrl(undefined)).toBeUndefined();
  });
});

describe('scrubEventUrls', () => {
  it('redacts the request URL and every URL-bearing breadcrumb field', () => {
    const event = {
      request: { url: 'https://renewsubastas.com.py/es/auth/set-password?token=SECRET' },
      breadcrumbs: [
        { data: { from: '/es/login', to: '/es/auth/action?oobCode=SECRET' } },
        { data: { url: 'https://renewsubastas.com.py/api/x?token=SECRET' } },
        { data: { method: 'GET' } },
        {},
      ],
    };

    const out = scrubEventUrls(event);

    expect(JSON.stringify(out)).not.toContain('SECRET');
    expect(out.request.url).toContain('/es/auth/set-password');
    expect(out.breadcrumbs[0]?.data?.from).toBe('/es/login');
    expect(out.breadcrumbs[2]?.data?.method).toBe('GET');
  });

  it('survives an event with no request and no breadcrumbs', () => {
    expect(() => scrubEventUrls({})).not.toThrow();
  });
});
