import './globals.css';
import { Inter, Bricolage_Grotesque } from 'next/font/google';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const bricolage = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-bricolage' });

export const metadata = { title: 'CARBID', description: 'Subastas de vehículos' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} ${bricolage.variable}`} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
