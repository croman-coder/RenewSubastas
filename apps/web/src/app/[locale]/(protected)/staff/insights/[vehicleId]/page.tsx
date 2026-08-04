import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, Eye } from 'lucide-react';
import { requireRole } from '@/lib/auth/server';
import { loadVehicleInsight } from '@/lib/insights/load-vehicle-insight';
import {
  AUCTION_OUTCOME_LABEL,
  AUCTION_STATUS_LABEL,
  VEHICLE_STATUS_LABEL,
  fmtUsd,
} from '@/lib/insights/format';

export const dynamic = 'force-dynamic';

interface Props {
  params: { locale: string; vehicleId: string };
}

export default async function VehicleInsightPage({ params: { locale, vehicleId } }: Props) {
  await requireRole(locale, ['admin', 'staff']);
  const v = await loadVehicleInsight(vehicleId);
  if (!v) notFound();

  const fmtDate = (ms: number) =>
    new Intl.DateTimeFormat('es-PY', { dateStyle: 'short', timeStyle: 'short' }).format(ms);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          href={`/${locale}/staff/insights` as `/${string}`}
          className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-strong transition-colors"
        >
          <ArrowLeft className="w-3 h-3" aria-hidden /> Reporte
        </Link>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-text-strong">
          {v.make} {v.model} <span className="text-text-muted num-tab">{v.year}</span>
        </h1>
        <p className="flex flex-wrap items-center gap-3 text-sm text-text-muted">
          <span>{VEHICLE_STATUS_LABEL[v.status] ?? v.status}</span>
          {v.daysListed !== null && (
            <span className={v.unsoldAlert ? 'text-rose-400 font-medium' : ''}>
              {v.unsoldAlert && (
                <AlertTriangle className="inline w-3.5 h-3.5 mr-1 -mt-0.5" aria-hidden />
              )}
              {v.daysListed} día{v.daysListed === 1 ? '' : 's'} publicado
            </span>
          )}
        </p>
      </header>

      <section className="rounded-xl border border-text-subtle/15 bg-bg-elev/40">
        <h2 className="px-5 pt-4 pb-2 text-sm font-semibold text-text-strong">
          Movimientos de precio
        </h2>
        {v.priceChanges.length === 0 ? (
          <p className="px-5 pb-5 text-xs text-text-muted">Sin cambios de precio registrados.</p>
        ) : (
          <ul className="px-5 pb-4 divide-y divide-text-subtle/10">
            {v.priceChanges.map((c, i) => (
              <li key={i} className="py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="inline-flex items-center gap-2 num-tab text-text-strong shrink-0">
                  {c.isReduction ? (
                    <ArrowDown className="w-4 h-4 text-rose-400 shrink-0" aria-hidden />
                  ) : (
                    <ArrowUp className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden />
                  )}
                  {c.from !== null ? fmtUsd(c.from) : '—'} → {c.to !== null ? fmtUsd(c.to) : '—'}
                </span>
                <span className="text-xs text-text-muted truncate min-w-0 flex-1">
                  {c.field === 'reservePrice' ? 'reserva' : 'precio base'} · {c.actorName}
                </span>
                <span className="text-xs text-text-muted num-tab shrink-0">{fmtDate(c.atMs)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-text-subtle/15 bg-bg-elev/40">
        <h2 className="px-5 pt-4 pb-2 text-sm font-semibold text-text-strong">
          Quiénes lo miraron
        </h2>
        {v.viewers.length === 0 ? (
          <p className="px-5 pb-5 text-xs text-text-muted">Sin vistas registradas todavía.</p>
        ) : (
          <ul className="px-5 pb-4 divide-y divide-text-subtle/10">
            {v.viewers.map((w) => (
              <li
                key={w.uid}
                className="py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
              >
                <Eye className="w-4 h-4 text-text-muted shrink-0" aria-hidden />
                <span className="text-text-strong flex-1 min-w-0 truncate">{w.name}</span>
                <span className="text-xs text-text-muted num-tab shrink-0">
                  {w.viewCount} vista{w.viewCount === 1 ? '' : 's'}
                </span>
                <span className="text-xs text-text-muted num-tab shrink-0">
                  {fmtDate(w.lastViewAtMs)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-text-subtle/15 bg-bg-elev/40">
        <h2 className="px-5 pt-4 pb-2 text-sm font-semibold text-text-strong">Subastas</h2>
        {v.auctions.length === 0 ? (
          <p className="px-5 pb-5 text-xs text-text-muted">Nunca fue subastado.</p>
        ) : (
          <ul className="px-5 pb-4 divide-y divide-text-subtle/10">
            {v.auctions.map((a) => (
              <li key={a.id} className="py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <Link
                  href={`/${locale}/staff/auctions/${a.id}` as `/${string}`}
                  className="text-text-strong hover:text-copper transition-colors flex-1 min-w-0 truncate"
                >
                  {AUCTION_STATUS_LABEL[a.status] ?? a.status}
                  {a.outcome ? ` · ${AUCTION_OUTCOME_LABEL[a.outcome] ?? a.outcome}` : ''}
                </Link>
                <span className="text-xs text-text-muted num-tab shrink-0">
                  {a.viewsUnique} únicos / {a.viewsTotal}
                </span>
                <span className="num-tab text-text-strong shrink-0">
                  {fmtUsd(a.finalPrice ?? a.startingPrice)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
