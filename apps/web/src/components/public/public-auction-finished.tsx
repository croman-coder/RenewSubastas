import Link from 'next/link';
import { vehicleAlt } from '@/lib/format/vehicle-alt';
import type { PublicAuctionDetail } from '@/lib/buyer/public-auction';
import type { FinishedResult } from '@/lib/auctions/public-state';

const RESULT: Record<FinishedResult, string> = {
  sold: 'Este vehículo se vendió.',
  unsold: 'Esta subasta cerró sin venta.',
  cancelled: 'Esta subasta fue cancelada.',
  pending: 'La subasta acaba de cerrar; el resultado se confirma en unos minutos.',
};

/** Dónde cae un link viejo una vez que la subasta terminó (spec §6). */
export function PublicAuctionFinished({
  locale,
  detail,
  result,
}: {
  locale: string;
  detail: PublicAuctionDetail;
  result: FinishedResult;
}) {
  const title = vehicleAlt(detail.make, detail.model, detail.year);
  const photo = detail.images[0]?.thumbnailUrl;
  return (
    <section className="rounded-2xl border border-text-subtle/15 bg-bg-elev p-5 shadow-card grid gap-5 sm:grid-cols-[260px_1fr] items-center">
      {photo && (
        <img
          src={photo}
          alt={title}
          width={640}
          height={480}
          className="w-full aspect-[4/3] rounded-xl object-cover"
        />
      )}
      <div className="space-y-3">
        <p className="text-[11px] uppercase tracking-[0.12em] font-semibold text-text-muted">
          Subasta finalizada
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-text-strong">{title}</h1>
        <p className="text-text-muted">{RESULT[result]}</p>
        <Link
          href={`/${locale}` as `/${string}`}
          className="h-11 inline-flex items-center justify-center rounded-lg bg-text-strong px-5 text-bg-base text-sm font-semibold transition-opacity hover:opacity-90"
        >
          Ver subastas en vivo
        </Link>
      </div>
    </section>
  );
}
