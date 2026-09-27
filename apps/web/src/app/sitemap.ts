import type { MetadataRoute } from 'next';
import { buildSitemap } from '@/lib/seo/sitemap-entries';
import { listLandingAuctions } from '@/lib/buyer/landing-auctions';

// At most once an hour: auctions come and go, the static pages don't.
export const revalidate = 3600;

/**
 * The landing and legal pages, plus every open retail auction (its public
 * page since 2026-09-26). If the catalog can't be read, the static part
 * still goes out rather than the whole sitemap failing.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const items = await listLandingAuctions().catch(() => []);
  const open = items
    .filter((a) => a.status === 'live' || a.status === 'scheduled')
    .map((a) => a.id);
  return buildSitemap(open, new Date());
}
