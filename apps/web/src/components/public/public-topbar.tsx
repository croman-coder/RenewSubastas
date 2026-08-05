import Link from 'next/link';
import { LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RenewWordmark } from '@/components/brand/renew-wordmark';

interface Props {
  locale: string;
}

/**
 * Topbar for the signed-out landing.
 *
 * Deliberately NOT the app `Topbar`: that one takes a resolved user
 * (email/role/audience/nav items) and renders account and notification
 * surfaces that make no sense before login. Keeping them separate avoids
 * threading a nullable user through every branch of the app shell.
 */
export function PublicTopbar({ locale }: Props) {
  return (
    <header className="sticky top-0 z-40 border-b border-text-subtle/15 bg-bg-base/85 backdrop-blur supports-[backdrop-filter]:bg-bg-base/70">
      <div className="mx-auto max-w-7xl px-4 md:px-8 h-14 flex items-center justify-between gap-4">
        <Link
          href={`/${locale}` as `/${string}`}
          className="flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-strong/40"
          aria-label="Renew Subastas — inicio"
        >
          <RenewWordmark size="sm" />
        </Link>

        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href={`/${locale}/login` as `/${string}`}>
              <LogIn className="w-4 h-4 mr-1.5" aria-hidden />
              Iniciar sesión
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
