import type { MetadataRoute } from 'next';
import { SITE_URL, INDEXED_LOCALES, DEFAULT_LOCALE, INDEXABLE_PATHS } from '@/lib/seo/site';

/**
 * Sitemap covering only what an anonymous visitor can reach and is worth
 * indexing: the landing and the legal pages, in the indexed locales.
 *
 * Individual auction pages are deliberately absent: they sit behind auth, and
 * their lifespan is a lote. Listing URLs that 302 to /login and disappear in
 * a week trains crawlers to distrust the sitemap. /login and the English copy
 * are out too — see INDEXABLE_PATHS and INDEXED_LOCALES.
 *
 * Each entry carries `alternates.languages` so that, once more than one locale
 * is indexed, they are understood as translations of one page rather than
 * duplicates competing with each other.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return INDEXABLE_PATHS.flatMap((path) =>
    INDEXED_LOCALES.map((locale) => ({
      url: `${SITE_URL}/${locale}${path}`,
      lastModified,
      changeFrequency: path === '' ? ('daily' as const) : ('monthly' as const),
      // The landing is the entry point; the legal pages are reference material.
      priority: path === '' ? 1 : 0.4,
      alternates: {
        languages: Object.fromEntries([
          ...INDEXED_LOCALES.map((l) => [l, `${SITE_URL}/${l}${path}`]),
          ['x-default', `${SITE_URL}/${DEFAULT_LOCALE}${path}`],
        ]),
      },
    })),
  );
}
