import type { MetadataRoute } from 'next';
import { DEFAULT_LOCALE, INDEXABLE_PATHS, INDEXED_LOCALES, SITE_URL } from './site';

function languages(path: string) {
  return Object.fromEntries([
    ...INDEXED_LOCALES.map((l) => [l, `${SITE_URL}/${l}${path}`]),
    ['x-default', `${SITE_URL}/${DEFAULT_LOCALE}${path}`],
  ]);
}

/**
 * Pure half of the sitemap, so it is testable without Firestore
 * (app/sitemap.ts imports a server-only loader).
 *
 * Auctions enter only while open (scheduled or live) and leave when they
 * close (spec 2026-09-26 §7); no lastModified for them, since a bid changes
 * the page and the sitemap is regenerated at most hourly.
 */
export function buildSitemap(auctionIds: string[], now: Date): MetadataRoute.Sitemap {
  const pages = INDEXABLE_PATHS.flatMap((path) =>
    INDEXED_LOCALES.map((locale) => ({
      url: `${SITE_URL}/${locale}${path}`,
      lastModified: now,
      changeFrequency: path === '' ? ('daily' as const) : ('monthly' as const),
      priority: path === '' ? 1 : 0.4,
      alternates: { languages: languages(path) },
    })),
  );
  const auctions = auctionIds.flatMap((id) =>
    INDEXED_LOCALES.map((locale) => ({
      url: `${SITE_URL}/${locale}/auctions/${id}`,
      changeFrequency: 'hourly' as const,
      priority: 0.8,
      alternates: { languages: languages(`/auctions/${id}`) },
    })),
  );
  return [...pages, ...auctions];
}
