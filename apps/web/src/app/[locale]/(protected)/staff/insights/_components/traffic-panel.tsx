import { Activity, Eye } from 'lucide-react';
import { KpiCard } from '@/components/brand/kpi-card';
import type { TrafficInsights } from '@/lib/insights/load-traffic';
import { ANONYMOUS_FUNNEL_STAGES, SIGNED_IN_FUNNEL_STAGES } from '@/lib/insights/traffic-summary';
import { TrafficSeriesChart } from './traffic-series-chart';
import { TrafficSourceBreakdown } from './traffic-source-breakdown';
import { TrafficFunnel } from './traffic-funnel';

interface Props {
  insights: TrafficInsights;
}

/** "10 días" / "1 día", for interpolating into the two funnel descriptions below. */
function diasLabel(days: number): string {
  return `${days} día${days === 1 ? '' : 's'}`;
}

/**
 * Site-wide traffic block for /staff/insights, above the per-vehicle list.
 *
 * Presents TWO separate journeys, never one combined funnel — this app's
 * own routing makes `home` (recorded only for anonymous visitors) and
 * `catalog`/`detail` (recorded only for signed-in ones) two essentially
 * disjoint populations; see the doc comment on `ANONYMOUS_FUNNEL_STAGES` /
 * `SIGNED_IN_FUNNEL_STAGES` in traffic-summary.ts for the routing evidence.
 * A percentage computed across that boundary measures the login wall, not
 * visitor drop-off, so no number here ever spans the two:
 *
 *   - "Anónimos" (home -> login), paired with the source breakdown right
 *     next to it — together they answer Croman's actual question: the
 *     Instagram spend brought N people, and M of them tried to sign in.
 *   - "Con sesión" (catalog -> detail), its own full-width block, visually
 *     and structurally separate from the row above: real browsing
 *     behaviour, but only of people who already have an account.
 *
 * Both funnel cards say their own scope in plain Spanish in their own
 * header — the boundary is never left to be inferred from layout alone.
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
  const dias = diasLabel(summary.days);

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
          <TrafficSeriesChart
            data={seriesData}
            totalViews={summary.totalViews}
            totalSessions={summary.totalSessions}
          />

          {/* Anónimos: paired with the source breakdown on purpose — together
              they answer "el gasto en Instagram trajo N personas, y M
              intentaron entrar". Neither card's number is ever combined with
              the other's; they sit side by side because they're the same
              story told two ways, not because they share a percentage. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 [&>*]:h-full">
            <TrafficSourceBreakdown bySource={summary.bySource} days={summary.days} />
            <TrafficFunnel
              funnel={summary.funnel}
              stages={ANONYMOUS_FUNNEL_STAGES}
              title="Anónimos"
              description={`Visitantes sin cuenta: cuántos entraron a la home y cuántos de esos llegaron al login. No incluye catálogo ni fichas — esas páginas piden cuenta iniciada. Últimos ${dias}.`}
            />
          </div>

          {/* Con sesión: intentionally its own full-width block, visually
              separate from the row above — a different population, so it
              never sits beside "Anónimos" as if the two connected. */}
          <TrafficFunnel
            funnel={summary.funnel}
            stages={SIGNED_IN_FUNNEL_STAGES}
            title="Con sesión"
            description={`Compradores con cuenta iniciada: catálogo visto y fichas abiertas. No incluye visitantes anónimos — sin cuenta no se puede ver estas páginas. Últimos ${dias}.`}
          />
        </>
      )}
    </section>
  );
}
