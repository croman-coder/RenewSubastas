import { NextResponse, type NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';

const intlMiddleware = createMiddleware({
  locales: ['es', 'en'],
  defaultLocale: 'es',
  localeDetection: true,
});

/**
 * Every real first segment under a locale.
 *
 * `[locale]/(protected)/[audience]` is a dynamic segment, so it matched ANY
 * single path — `/es/cualquier-cosa` rendered the buyer tree, whose parent
 * layout redirected to /login and answered 200. That gave crawlers an
 * unbounded space of distinct URLs all resolving to a login page: a soft 404,
 * which search engines penalise.
 *
 * The audience layout's own notFound() can't catch it, because layouts render
 * outside-in and the (protected) layout's auth redirect fires first.
 * Constraining the params instead (dynamicParams=false + generateStaticParams)
 * was tried and breaks the real routes: these pages read cookies(), so nothing
 * can be statically generated and every audience 404s — including retail.
 *
 * So the check happens here, before any layout runs. It is an allowlist, which
 * means adding a route requires adding it here — but the failure mode is a
 * loud 404 on a brand-new route in dev, not silent breakage in production.
 */
const KNOWN_SEGMENTS = new Set([
  // Buyer
  'retail',
  'wholesale',
  'auctions',
  // Internal
  'admin',
  'staff',
  'sales',
  'settings',
  // Auth
  'login',
  'register',
  'auth',
  // Legal
  'terminos',
  'privacidad',
  'cookies',
]);

const LOCALES = new Set(['es', 'en']);

export default function middleware(req: NextRequest) {
  const segments = req.nextUrl.pathname.split('/').filter(Boolean);

  // Only guard `/{locale}/{segment}` and deeper. `/{locale}` alone is the
  // landing, and a path with no known locale is left to next-intl to redirect.
  if (segments.length >= 2 && LOCALES.has(segments[0]!) && !KNOWN_SEGMENTS.has(segments[1]!)) {
    return NextResponse.rewrite(new URL('/_not-found', req.url), { status: 404 });
  }

  return intlMiddleware(req);
}

// Excludes:
//   api          server routes
//   _next        Next internals
//   _vercel      vercel internals
//   monitoring   Sentry tunnel
//   icon, apple-icon, favicon, manifest, robots, sitemap   App Router metadata
//                files at the root level. Without this exclusion the next-intl
//                middleware redirects /icon -> /es/icon -> 404 because no
//                locale-prefixed icon route exists.
//   .*\\..*      anything containing a dot (static assets like .png, .ico)
export const config = {
  matcher: [
    '/((?!api|_next|_vercel|monitoring|icon|apple-icon|favicon|manifest|robots|sitemap|.*\\..*).*)',
  ],
};
