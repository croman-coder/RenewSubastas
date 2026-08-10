import { Suspense } from 'react';
import { Inter, Space_Grotesk } from 'next/font/google';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { isLocale, SITE_URL } from '@/lib/seo/site';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { Toaster } from '@/components/ui/sonner';
import { CookieBanner } from '@/components/legal/cookie-banner';
import { MetaPixelRouteTracker } from '@/components/analytics/meta-pixel-route-tracker';
import { TrafficTracker } from '@/components/analytics/traffic-tracker';
import '../globals.css';

// Body: Inter (modern neutral grotesque, excellent at small sizes).
// Wordmark/display: Space Grotesk — geometric, sharp counters, pairs well
// with the outlined/solid contrast of the Renew logo.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const display = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['400', '500', '600', '700'],
});

export const metadata = {
  // Without metadataBase, Next emits the generated opengraph-image as a
  // relative URL and warns at build. A crawler or chat unfurl can't resolve
  // a relative image, so the preview silently falls back to no image.
  metadataBase: new URL(SITE_URL),
  title: 'Renew Subastas',
  description: 'Subastas de vehículos · Santa Rosa Paraguay SA',
};

// `viewport-fit=cover` lets the layout paint under the notch/home-indicator so
// `env(safe-area-inset-*)` (used by fixed bottom bars, drawers, etc.) resolves
// to real values instead of 0 — without it every safe-area rule is a no-op.
// No maximumScale/userScalable: pinch-to-zoom must stay available (WIG
// anti-pattern). themeColor mirrors --bg-base per theme (see globals.css);
// the dark value is an sRGB approximation of oklch(0.13 0 0).
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#131313' },
  ],
};

export default async function LocaleLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  // `[locale]` matched literally anything, so every path the middleware
  // excludes from the locale redirect — /favicon.ico, /icon, /manifest,
  // /robots.txt — fell through to here and answered 200 with the full HTML
  // app (lang="favicon.ico"). Browsers request /favicon.ico unprompted, and
  // a 200 HTML body is worse than a 404: crawlers accept it as real. It also
  // opened an unbounded URL space where every junk path rendered the site.
  if (!isLocale(locale)) notFound();

  const messages = await getMessages();
  return (
    <html
      lang={locale}
      className={`${inter.variable} ${display.variable}`}
      suppressHydrationWarning
    >
      <body>
        <NextIntlClientProvider messages={messages} locale={locale}>
          <AuthProvider>
            <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
              {children}
              {/* Global: the choice has to be reachable from every surface,
                  and every consent-gated tracker stays off until it's made. */}
              <CookieBanner locale={locale} />
              {/* Suspense is required, not decorative: useSearchParams opts
                  the nearest boundary into client rendering, and without one
                  the build fails. Isolating it here keeps every page static
                  that already was. TrafficTracker shares this boundary
                  rather than getting its own for the same reason — it also
                  needs useSearchParams. */}
              <Suspense fallback={null}>
                <MetaPixelRouteTracker />
                <TrafficTracker />
              </Suspense>
              <Toaster position="top-right" richColors closeButton />
            </ThemeProvider>
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
