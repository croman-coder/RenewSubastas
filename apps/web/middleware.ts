import createMiddleware from 'next-intl/middleware';

export default createMiddleware({
  locales: ['es', 'en'],
  defaultLocale: 'es',
  localeDetection: true,
});

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
