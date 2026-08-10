import { Activity, Eye } from 'lucide-react';
import { KpiCard } from '@/components/brand/kpi-card';
import type { TrafficInsights } from '@/lib/insights/load-traffic';
import { TrafficSeriesChart } from './traffic-series-chart';
import { TrafficSourceBreakdown } from './traffic-source-breakdown';
import { TrafficFunnel } from './traffic-funnel';

interface Props {
  insights: TrafficInsights;
}

/**
 * Site-wide traffic block for /staff/insights, above the per-vehicle list.
 * Answers the three questions the design doc frames this feature around
 * (docs/superpowers/specs/2026-08-08-trafico-web-design.md) in that order:
 * how many people come in, where from, and — last, full width — where they
 * drop off. The funnel is placed last and given the most horizontal room on
 * purpose: it is the number that turns into a decision, not the raw counts.
 *
 * `today` (live, partial) and `history`/`summary` (closed, complete) are two
 * independent data sources — see load-traffic.ts — so they get two
 * independent empty states here, never one blended message:
 *   - Neither exists yet (brand-new deploy): one sentence, nothing else.
 *   - `today` exists but `history` doesn't (deployed today, scheduler
 *     hasn't run yet): show today's real numbers, explain the rest.
 *   - `history` exists but `today` doesn't yet (quiet early morning):
 *     show the real history, explain today in one line instead of "0".
 */
export function TrafficPanel({ insights }: Props) {
  const { today, history, summary } = insights;
  const hasToday = today.views > 0;
  const hasHistory = history.length > 0;

  if (!hasToday && !hasHistory) {
    return (
      <section className="rounded-xl border border-dashed border-text-subtle/25 bg-bg-elev/30 px-5 py-8 text-center">
        <p className="text-sm text-text-muted max-w-prose mx-auto">
          Todavía no hay datos de tráfico. El contador recién arranca: en cuanto entre la primera
          visita vas a ver el conteo de hoy acá, y el resumen de días anteriores va a aparecer a
          partir de mañana, cuando corra el resumen diario de las 9:30.
        </p>
      </section>
    );
  }

  const seriesData = history.map((d) => ({
    date: d.date,
    views: d.totalViews,
    sessions: d.uniqueSessions,
  }));

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-text-strong tracking-tight">Tráfico del sitio</h2>
        <p className="text-xs text-text-muted mt-0.5">
          De dónde viene la gente que entra a la web y en qué paso se cae.
        </p>
      </div>

      {hasToday ? (
        <div className="grid grid-cols-2 gap-4 max-w-md">
          <KpiCard
            index={0}
            label="Visitas hoy"
            value={today.views}
            icon={<Eye className="w-5 h-5" strokeWidth={2.25} />}
            caption="Parcial — el día sigue en curso"
          />
          <KpiCard
            index={1}
            label="Sesiones hoy"
            value={today.sessions}
            icon={<Activity className="w-5 h-5" strokeWidth={2.25} />}
            caption="Parcial — el día sigue en curso"
          />
        </div>
      ) : (
        <p className="text-sm text-text-muted">Sin visitas registradas todavía hoy.</p>
      )}

      {!hasHistory ? (
        <div className="rounded-xl border border-dashed border-text-subtle/25 bg-bg-elev/30 px-5 py-6 text-center">
          <p className="text-sm text-text-muted max-w-prose mx-auto">
            Todavía no hay días anteriores agregados — el resumen diario corre a las 9:30 y hoy es
            el primer día. La serie, el origen y el embudo van a aparecer acá a partir de mañana.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 [&>*]:h-full">
            <div className="lg:col-span-2">
              <TrafficSeriesChart
                data={seriesData}
                totalViews={summary.totalViews}
                totalSessions={summary.totalSessions}
              />
            </div>
            <TrafficSourceBreakdown bySource={summary.bySource} days={summary.days} />
          </div>
          <TrafficFunnel funnel={summary.funnel} days={summary.days} />
        </>
      )}
    </section>
  );
}
