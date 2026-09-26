import 'server-only';
import { unstable_cache } from 'next/cache';
import { listPublicAuctions } from './list-public-auctions';

/**
 * The public landing's catalog, cached for 60 seconds.
 *
 * The landing is the most visited page (~4.900 views in 30 days) and it ran
 * the catalog queries against Firestore on every one of them: two queries
 * per visit plus the function time Netlify bills in credits, and a 2,8 s
 * server response on mobile (auditoría, 2026-09-26). A minute of staleness is
 * harmless here: signed-in buyers never see this list (the page redirects
 * them to their live catalog), and the card's countdown runs on the client.
 *
 * `audience: 'retail'` is hardcoded and must stay that way: wholesale is a
 * closed segment and must never be visible to an anonymous visitor.
 *
 * The result is plain JSON (numbers and strings, no Timestamps), which is
 * what the data cache requires.
 */
export const listLandingAuctions = unstable_cache(
  () => listPublicAuctions({ tab: 'all', audience: 'retail' }),
  ['landing-auctions-retail'],
  { revalidate: 60 },
);
