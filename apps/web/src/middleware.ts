import createMiddleware from 'next-intl/middleware';

export default createMiddleware({
  locales: ['es', 'en'],
  defaultLocale: 'es',
  localeDetection: true,
});

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
