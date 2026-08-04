import { Inter, Space_Grotesk } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { Toaster } from '@/components/ui/sonner';
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
              <Toaster position="top-right" richColors closeButton />
            </ThemeProvider>
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
