import Link from 'next/link';
import { auctionPath } from '@/lib/buyer/public-auction';

/**
 * Ocupa el lugar del panel de pujas para visitantes sin cuenta. Los dos
 * links llevan `from`, así que al crear la cuenta o iniciar sesión vuelven
 * a esta subasta (las páginas de registro y login ya lo respetan).
 */
export function BidCta({
  locale,
  auctionId,
  scheduled,
}: {
  locale: string;
  auctionId: string;
  scheduled: boolean;
}) {
  const from = encodeURIComponent(auctionPath(locale, auctionId));
  return (
    <div className="rounded-2xl border border-text-subtle/15 bg-bg-elev p-5 space-y-3 shadow-card">
      <p className="text-base font-semibold text-text-strong">
        {scheduled ? 'Creá tu cuenta para pujar cuando abra' : 'Creá tu cuenta para pujar'}
      </p>
      <p className="text-sm text-text-muted text-pretty">
        Es gratis. Al terminar volvés a esta subasta.
      </p>
      <div className="grid gap-2">
        <Link
          href={`/${locale}/register?from=${from}` as `/${string}`}
          className="h-11 inline-flex items-center justify-center rounded-lg bg-text-strong text-bg-base text-sm font-semibold transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-text-strong/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-elev"
        >
          Crear cuenta
        </Link>
        <Link
          href={`/${locale}/login?from=${from}` as `/${string}`}
          className="h-11 inline-flex items-center justify-center rounded-lg border border-text-subtle/25 text-text-strong text-sm font-medium transition-colors hover:bg-bg-deep/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-text-strong/40"
        >
          Ya tengo cuenta
        </Link>
      </div>
    </div>
  );
}
