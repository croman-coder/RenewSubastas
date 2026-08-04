import Link from 'next/link';
import { AlertTriangle, Eye, Gavel, TrendingDown } from 'lucide-react';
import { requireRole } from '@/lib/auth/server';
import { loadInsights } from '@/lib/insights/load-insights';
import { VEHICLE_STATUS_LABEL, fmtUsd } from '@/lib/insights/format';

export const dynamic = 'force-dynamic';

export default async function InsightsPage({ params: { locale } }: { params: { locale: string } }) {
  await requireRole(locale, ['admin', 'staff']);
  const rows = await loadInsights();

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <p className="text-[11px] uppercase tracking-[0.12em] text-text-muted font-semibold">
          Reporte
        </p>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-text-strong">
          Insights de remates
        </h1>
        <p className="text-sm text-text-muted">
          Quién mira cada vehículo, cómo se movió el precio y cuáles llevan 7+ días sin venderse.
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-text-subtle/15 bg-bg-elev/40 px-4 py-10 text-center">
          <p className="text-sm text-text-muted">Todavía no hay vehículos publicados.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {rows.map((r) => (
            <li key={r.vehicleId}>
              <Link
                href={`/${locale}/staff/insights/${r.vehicleId}` as `/${string}`}
                className="flex items-center gap-3 rounded-xl border border-text-subtle/15 bg-bg-elev/40 px-4 py-3 transition-colors hover:border-text-subtle/30 hover:bg-bg-elev/60"
              >
                {r.thumbnailUrl ? (
                  <img
                    src={r.thumbnailUrl}
                    alt=""
                    width={48}
                    height={48}
                    loading="lazy"
                    className="w-12 h-12 rounded-md object-cover shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-md bg-bg-deep/60 shrink-0 grid place-items-center">
                    <Gavel className="w-4 h-4 text-text-muted/40" aria-hidden />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-strong truncate">
                    {r.make} {r.model} <span className="text-text-muted num-tab">{r.year}</span>
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-text-muted">
                    <span className="inline-flex items-center gap-1">
                      <Eye className="w-3 h-3" aria-hidden /> {r.viewsUnique} únicos ·{' '}
                      {r.viewsTotal} vistas
                    </span>
                    {r.priceReductions > 0 && (
                      <span className="inline-flex items-center gap-1 text-rose-400">
                        <TrendingDown className="w-3 h-3" aria-hidden /> {r.priceReductions} baja
                        {r.priceReductions === 1 ? '' : 's'}
                      </span>
                    )}
                    {r.currentPrice !== null && (
                      <span className="num-tab">{fmtUsd(r.currentPrice)}</span>
                    )}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  {r.daysListed !== null && (
                    <p
                      className={
                        'text-xs num-tab font-medium ' +
                        (r.unsoldAlert ? 'text-rose-400' : 'text-text-muted')
                      }
                    >
                      {r.unsoldAlert && (
                        <AlertTriangle className="inline w-3 h-3 mr-1 -mt-0.5" aria-hidden />
                      )}
                      {r.daysListed} día{r.daysListed === 1 ? '' : 's'}
                    </p>
                  )}
                  <p className="text-[11px] text-text-muted mt-0.5">
                    {VEHICLE_STATUS_LABEL[r.status] ?? r.status}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
