import type { Metadata } from 'next';

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

/**
 * Locales search engines are allowed to index.
 *
 * English is left out: /en still serves the landing's Spanish title,
 * description and copy under an English hreflang, which reads as duplicate
 * content (auditoría SEO, 2026-09-26). Add 'en' back once it is translated —
 * the sitemap, the landing's hreflang and the robots meta all follow this list.
 */
export const INDEXED_LOCALES: readonly Locale[] = ['es'];

/**
 * Routes worth indexing, relative to a locale prefix.
 *
 * /login is public but not here: a form with no content of its own, which
 * only competes with the landing for brand searches.
 */
export const INDEXABLE_PATHS = ['', '/terminos', '/privacidad', '/cookies'] as const;

const NO_INDEX = { index: false, follow: true } as const;

/** Robots directive for a whole locale; undefined means "index as usual". */
export function indexRobots(locale: string): Metadata['robots'] {
  return (INDEXED_LOCALES as readonly string[]).includes(locale) ? undefined : NO_INDEX;
}

const AUTH_TITLES = {
  login: { es: 'Iniciar sesión', en: 'Sign in' },
  register: { es: 'Crear cuenta', en: 'Create account' },
} as const;

/**
 * Metadata for the sign-in and sign-up pages: a real title instead of the
 * layout's bare "Renew Subastas", and noindex — follow stays on so the links
 * to the legal pages still count.
 */
export function authPageMetadata(locale: string, page: keyof typeof AUTH_TITLES): Metadata {
  const lang = locale === 'en' ? 'en' : 'es';
  return { title: `${AUTH_TITLES[page][lang]} · Renew Subastas`, robots: NO_INDEX };
}
