import type { MetadataRoute } from 'next';
import { DEFAULT_LOCALE, INDEXABLE_PATHS, INDEXED_LOCALES, SITE_URL } from './site';

function languages(path: string) {
  return Object.fromEntries([
    ...INDEXED_LOCALES.map((l) => [l, `${SITE_URL}/${l}${path}`]),
    ['x-default', `${SITE_URL}/${DEFAULT_LOCALE}${path}`],
  ]);
}

/**
 * La mitad pura del sitemap, para poder testearla sin Firestore
 * (app/sitemap.ts importa un cargador server-only).
 *
 * Las subastas entran solo mientras están abiertas (programadas o en vivo) y
 * salen al cerrar (spec 2026-09-26 §7). No llevan lastModified: una puja
 * cambia la página y el sitemap se regenera como mucho cada hora.
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
