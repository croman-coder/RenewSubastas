import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo/site';

/**
 * Real robots.txt.
 *
 * Without this route the path fell through to `[locale]` and answered 200
 * with the full HTML app and `lang="robots.txt"` — the middleware matcher
 * excludes `robots` from the locale redirect, but nothing was serving it.
 * A crawler asking for crawl rules got a web page.
 *
 * Everything behind auth is disallowed. Those routes redirect to /login for
 * anonymous requests anyway, so crawling them yields nothing but wasted
 * budget and login pages in the index.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/es/admin',
          '/en/admin',
          '/es/staff',
          '/en/staff',
          '/es/settings',
          '/en/settings',
          '/es/sales',
          '/en/sales',
          '/es/retail',
          '/en/retail',
          '/es/wholesale',
          '/en/wholesale',
          '/es/auth',
          '/en/auth',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
