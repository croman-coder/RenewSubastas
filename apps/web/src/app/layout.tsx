import './globals.css';
import { Inter, Space_Grotesk } from 'next/font/google';

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} ${display.variable}`} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
