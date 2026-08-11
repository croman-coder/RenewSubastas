import { describe, it, expect } from 'vitest';
import { safeRedirect } from './post-session';

/**
 * safeRedirect decides where someone lands after signing in, so it has two
 * jobs and both can hurt: it must not let an attacker bounce a freshly
 * authenticated user off-site, and it must hand back a path the caller can
 * prefix with a locale exactly once.
 *
 * The second job is why these tests exist. Every caller does
 * `/${locale}${safeRedirect(from) ?? homeFor(role)}`, and `?from=` used to
 * arrive already carrying `/es`, producing `/es/es/auctions/x` — a bare 404
 * shown to anyone who clicked a vehicle on the public landing and then logged
 * in, whatever their role.
 */
describe('safeRedirect', () => {
  it('strips a locale prefix so the caller can add exactly one', () => {
    expect(safeRedirect('/es/auctions/abc123')).toBe('/auctions/abc123');
    expect(safeRedirect('/en/auctions/abc123')).toBe('/auctions/abc123');
  });

  it('leaves an already locale-less path alone', () => {
    expect(safeRedirect('/auctions/abc123')).toBe('/auctions/abc123');
    expect(safeRedirect('/admin')).toBe('/admin');
  });

  it('turns a bare locale into the root, not an empty string', () => {
    // '' would make the caller produce '/es' with no trailing path, which is
    // fine, but an empty target reads as "no redirect" at a glance. Be explicit.
    expect(safeRedirect('/es')).toBe('/');
    expect(safeRedirect('/en')).toBe('/');
  });

  it('does not mistake a real path segment for a locale', () => {
    // 'settings' and 'sales' are routes, not locales — they must survive.
    expect(safeRedirect('/settings/security')).toBe('/settings/security');
    expect(safeRedirect('/sales')).toBe('/sales');
    // A segment that merely starts with a locale's letters is not a locale.
    expect(safeRedirect('/essentials/x')).toBe('/essentials/x');
    expect(safeRedirect('/english')).toBe('/english');
  });

  it('strips only the first locale segment', () => {
    // A path that genuinely contains 'es' deeper down keeps it.
    expect(safeRedirect('/es/es-algo/x')).toBe('/es-algo/x');
  });

  it('rejects protocol-relative and external targets', () => {
    expect(safeRedirect('//evil.com')).toBeNull();
    expect(safeRedirect('/\\evil.com')).toBeNull();
    expect(safeRedirect('https://evil.com')).toBeNull();
    expect(safeRedirect('javascript:alert(1)')).toBeNull();
  });

  it('rejects a missing or relative target', () => {
    expect(safeRedirect(undefined)).toBeNull();
    expect(safeRedirect('')).toBeNull();
    expect(safeRedirect('auctions/abc')).toBeNull();
  });

  it('re-rejects a target that only becomes unsafe after the locale is stripped', () => {
    // The guard has to run on the stripped value too: "/es//evil.com" passes
    // the first check and would otherwise be handed back as "//evil.com".
    expect(safeRedirect('/es//evil.com')).toBeNull();
    expect(safeRedirect('/es/\\evil.com')).toBeNull();
  });

  it('strips the locale when a query string or hash follows it', () => {
    expect(safeRedirect('/es?next=x')).toBe('/?next=x');
    expect(safeRedirect('/es#top')).toBe('/#top');
    expect(safeRedirect('/es/auctions/x?tab=bids')).toBe('/auctions/x?tab=bids');
  });

  it('rejects a repeated ?from= param instead of throwing', () => {
    // Next hands a duplicated query param through as string[]. Coercion used
    // to get it past the regex and then blow up inside .replace.
    expect(safeRedirect(['/a', '/b'] as unknown as string)).toBeNull();
  });

  it('produces a valid URL when composed the way every caller composes it', () => {
    // The actual regression, expressed as the callers write it.
    const compose = (from: string | undefined, fallback: string) =>
      `/es${safeRedirect(from) ?? fallback}`;

    expect(compose('/es/auctions/abc123', '/admin')).toBe('/es/auctions/abc123');
    expect(compose(undefined, '/admin')).toBe('/es/admin');
    expect(compose('//evil.com', '/staff')).toBe('/es/staff');
  });
});
