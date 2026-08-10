import { describe, it, expect } from 'vitest';
import {
  classifyPath,
  classifySource,
  isBotUserAgent,
  isCredentialBearingPath,
  CredentialBearingPathError,
} from './log-page-view-rules.js';

describe('classifyPath', () => {
  it('classifies the home page, with or without a locale prefix', () => {
    expect(classifyPath('/es')).toBe('home');
    expect(classifyPath('/')).toBe('home');
  });

  it('classifies the auction catalog', () => {
    expect(classifyPath('/es/auctions')).toBe('catalog');
  });

  it('classifies an auction detail page', () => {
    expect(classifyPath('/es/auctions/abc123')).toBe('detail');
  });

  it('classifies login', () => {
    expect(classifyPath('/es/login')).toBe('login');
  });

  it('classifies an unrecognized page as other', () => {
    expect(classifyPath('/es/terminos')).toBe('other');
  });

  it('tolerates a trailing slash', () => {
    expect(classifyPath('/es/auctions/')).toBe('catalog');
    expect(classifyPath('/es/auctions/abc123/')).toBe('detail');
  });

  it('tolerates a missing locale prefix', () => {
    expect(classifyPath('/auctions')).toBe('catalog');
    expect(classifyPath('/login')).toBe('login');
  });

  it('treats /registro as other: no such route exists anywhere in the app', () => {
    // The brief lists /es/registro -> 'login' as an example, but there is no
    // signup route under apps/web/src/app/[locale] (grep confirms it), and
    // apps/web/src/middleware.ts's KNOWN_SEGMENTS allowlist — which 404s any
    // first segment it doesn't recognize — has no 'registro' entry either.
    // Followed the real app instead of the brief's example; see
    // task-1-report.md for the full note.
    expect(classifyPath('/es/registro')).toBe('other');
  });

  it('throws on the two credential-bearing routes', () => {
    expect(() => classifyPath('/es/auth/set-password')).toThrow(CredentialBearingPathError);
    expect(() => classifyPath('/es/auth/action')).toThrow(CredentialBearingPathError);
  });

  it('throws on a credential-bearing route with no locale prefix', () => {
    expect(() => classifyPath('/auth/action')).toThrow(CredentialBearingPathError);
  });

  it('throws on a nested child of a credential-bearing route', () => {
    expect(() => classifyPath('/es/auth/action/confirm')).toThrow(CredentialBearingPathError);
  });

  it('still throws if a caller mistakenly passes a full href with a query string', () => {
    // Defense in depth: classifyPath is documented to take a bare pathname
    // (window.location.pathname), never location.href. If a caller ever
    // passes the full href by mistake, the guard must still fire instead of
    // silently missing the match — that mistake is exactly the bug class
    // this module exists to prevent (see meta-pixel.ts).
    expect(() => classifyPath('/es/auth/action?oobCode=live-token-123')).toThrow(
      CredentialBearingPathError,
    );
  });

  it('the thrown error never carries the query string in its message', () => {
    expect.assertions(2);
    try {
      classifyPath('/es/auth/action?oobCode=live-token-123');
    } catch (err) {
      expect(err).toBeInstanceOf(CredentialBearingPathError);
      expect((err as Error).message).not.toContain('live-token-123');
    }
  });
});

describe('classifySource', () => {
  it('recognizes ig via utm_source, including the "instagram" alias', () => {
    expect(classifySource('ig', null)).toBe('ig');
    expect(classifySource('instagram', null)).toBe('ig');
  });

  it('recognizes fb via utm_source', () => {
    expect(classifySource('fb', null)).toBe('fb');
  });

  it('falls back to the referrer when there is no utm_source', () => {
    expect(classifySource(null, 'https://www.google.com/')).toBe('google');
  });

  it('still recognizes a real subdomain of google, instagram, or facebook', () => {
    expect(classifySource(null, 'https://accounts.google.com/')).toBe('google');
    expect(classifySource(null, 'https://l.instagram.com/')).toBe('ig');
    expect(classifySource(null, 'https://m.facebook.com/')).toBe('fb');
  });

  it('does not credit a look-alike domain as google (regression: needs a dot boundary)', () => {
    // Found in review: `host.endsWith('google.com')` alone also matches
    // 'notgoogle.com' and 'reallygoogle.com'. Anyone could register one of
    // those, link to the site, and have the visit silently miscredited to
    // Google — wrong attribution, not a credential leak, but this feature
    // exists specifically to tell Santa Rosa where traffic comes from.
    expect(classifySource(null, 'https://notgoogle.com/')).toBe('other');
    expect(classifySource(null, 'https://reallygoogle.com/')).toBe('other');
  });

  it('does not credit a look-alike domain as ig (regression: needs a dot boundary)', () => {
    expect(classifySource(null, 'https://fakeinstagram.com/')).toBe('other');
  });

  it('does not credit a look-alike domain as fb (regression: needs a dot boundary)', () => {
    // The fb.com branch already had the correct `=== || endsWith('.fb.com')`
    // shape; the bare facebook.com branch was the half that was missing it.
    expect(classifySource(null, 'https://notfacebook.com/')).toBe('other');
  });

  it('is direct when there is neither a utm_source nor a referrer', () => {
    expect(classifySource(null, null)).toBe('direct');
    expect(classifySource(undefined, undefined)).toBe('direct');
    expect(classifySource('', '')).toBe('direct');
  });

  it('never echoes an arbitrary utm_source back to the caller', () => {
    // The whole point of this function: no matter what the client sends,
    // only a closed-list value ever comes out.
    const junk = 'x'.repeat(200);
    expect(classifySource(junk, null)).toBe('other');
  });

  it('utm_source wins over referrer when both are present', () => {
    expect(classifySource('ig', 'https://www.google.com/')).toBe('ig');
  });

  it('an unrecognized referrer with no utm_source is other, not direct', () => {
    expect(classifySource(null, 'https://some-random-blog.example/post')).toBe('other');
  });

  it('a malformed referrer never throws', () => {
    expect(() => classifySource(null, 'not a url')).not.toThrow();
    expect(classifySource(null, 'not a url')).toBe('other');
  });
});

describe('isBotUserAgent', () => {
  it('recognizes known bots and crawlers', () => {
    expect(
      isBotUserAgent('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'),
    ).toBe(true);
    expect(
      isBotUserAgent('Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)'),
    ).toBe(true);
    expect(
      isBotUserAgent('Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)'),
    ).toBe(true);
    expect(
      isBotUserAgent('Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)'),
    ).toBe(true);
    expect(isBotUserAgent('curl/8.4.0')).toBe(true);
    expect(
      isBotUserAgent(
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/125.0.0.0 Safari/537.36',
      ),
    ).toBe(true);
  });

  it('does not flag a normal desktop browser', () => {
    expect(
      isBotUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      ),
    ).toBe(false);
  });

  it('does not flag mobile Safari', () => {
    expect(
      isBotUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
      ),
    ).toBe(false);
  });

  it('treats a missing user agent as not-a-bot', () => {
    expect(isBotUserAgent(null)).toBe(false);
    expect(isBotUserAgent(undefined)).toBe(false);
    expect(isBotUserAgent('')).toBe(false);
  });
});

describe('isCredentialBearingPath (local copy, functions/ workspace)', () => {
  // Mirrors apps/web/src/lib/analytics/meta-pixel.test.ts so both copies are
  // provably kept in sync. See the comment above CREDENTIAL_BEARING_PATHS in
  // log-page-view-rules.ts for why this duplication exists.
  it('blocks the two routes that carry a secret in the query string', () => {
    expect(isCredentialBearingPath('/es/auth/set-password')).toBe(true);
    expect(isCredentialBearingPath('/es/auth/action')).toBe(true);
  });

  it('blocks them without a locale prefix', () => {
    expect(isCredentialBearingPath('/auth/set-password')).toBe(true);
    expect(isCredentialBearingPath('/auth/action')).toBe(true);
  });

  it('tolerates a trailing slash', () => {
    expect(isCredentialBearingPath('/es/auth/action/')).toBe(true);
  });

  it('blocks nested children so a future sub-route cannot reopen the leak', () => {
    expect(isCredentialBearingPath('/es/auth/action/confirm')).toBe(true);
  });

  it('allows every ordinary page', () => {
    for (const path of ['/es', '/es/login', '/es/auctions', '/es/terminos', '/']) {
      expect(isCredentialBearingPath(path)).toBe(false);
    }
  });
});
