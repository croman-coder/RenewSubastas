/**
 * Canonical origin of the public site.
 *
 * Absolute URLs are required by robots.txt, the sitemap, canonical tags and
 * Open Graph — a relative OG image simply doesn't resolve when a crawler or
 * a chat client fetches it.
 *
 * Overridable per environment so a preview deploy doesn't advertise the
 * production origin as canonical, which would have previews competing with
 * the real site in the index.
 */
export const SITE_URL = (
  process.env['NEXT_PUBLIC_SITE_URL'] ?? 'https://renewsubastas.com.py'
).replace(/\/$/, '');

export const LOCALES = ['es', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'es';

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/** Public, indexable routes, relative to a locale prefix. */
export const PUBLIC_PATHS = ['', '/login', '/terminos', '/privacidad', '/cookies'] as const;
