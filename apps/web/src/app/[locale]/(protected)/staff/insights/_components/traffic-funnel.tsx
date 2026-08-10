import { Filter } from 'lucide-react';
import { FUNNEL_STAGE_LABEL } from '@/lib/insights/format';
import {
  buildFunnelSteps,
  funnelBarWidthsPct,
  type FunnelStage,
} from '@/lib/insights/traffic-summary';

interface Props {
  funnel: Record<FunnelStage, number>;
  /** Which journey this instance renders — e.g. `ANONYMOUS_FUNNEL_STAGES`
   *  or `SIGNED_IN_FUNNEL_STAGES` from traffic-summary.ts. NEVER the full
   *  4-stage `FUNNEL_STAGES`: see that module's doc comment on why home and
   *  catalog/detail cover two disjoint populations and can't share one
   *  funnel. */
  stages: readonly FunnelStage[];
  /** Short group name shown as this card's own heading — e.g. "Anónimos".
   *  Every instance of this component must say plainly, on its own, which
   *  group it covers; a reader should never have to infer the boundary
   *  from context. */
  title: string;
  /** One-line explanation of exactly who is (and, just as importantly, who
   *  is NOT) counted in this block. Callers fold the day-count in here
   *  (e.g. "... — últimos 10 días") since it's just more of the same
   *  sentence, not a second, separately-tracked prop. */
  description: string;
}

/**
 * One journey's funnel — either the anonymous one (home -> login) or the
 * signed-in one (catalog -> detail), never both combined. Counts alone
 * ("400 people came in") don't answer Croman's actual question — where the
 * drop happens does — but only WITHIN a single, coherent population. Each
 * row shows the stage's own count (bar width, relative to whichever stage
 * in THIS group is largest — see `funnelBarWidthsPct`, deliberately not
 * relative to the group's first stage specifically) AND the step-over-step
 * change versus the stage right before it.
 *
 * `pctOfPrevious` can exceed 100 (rendered as a "+" gain, emerald, not
 * clamped to a drop): a signed-in session can land straight on a vehicle
 * detail page via a bookmarked/shared link, skipping `catalog` for that
 * visit — funnel counts are independent per-stage distinct-session counts,
 * not a strict nested subset (see aggregateTraffic.ts). Treating every step
 * as a same-or-lower drop would silently mislabel real traffic shape as a
 * data bug. The same fact is why bar width is sized off the group's own
 * max, not off its first stage: a day where every anonymous visit lands on
 * `login` (home count 0 — see this component's `stages` doc comment for
 * why that happens) is that same expected shape, and every bar collapsing
 * to 0% while the count beside it reads 200 is exactly the "numbers right,
 * chart looking broken" failure this screen exists to avoid.
 */
export function TrafficFunnel({ funnel, stages, title, description }: Props) {
  const steps = buildFunnelSteps(funnel, stages);
  const barWidths = funnelBarWidthsPct(funnel, stages);
  const total = steps.reduce((acc, s) => acc + s.count, 0);

  return (
    <section className="rounded-xl border border-text-subtle/15 bg-bg-elev/40">
      <header className="flex items-center gap-2.5 px-5 pt-5 pb-1">
        <span className="w-7 h-7 rounded-md bg-text-strong/[0.06] text-text-strong grid place-items-center ring-1 ring-text-subtle/20">
          <Filter className="w-3.5 h-3.5" strokeWidth={2.25} />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-text-strong tracking-tight">{title}</h2>
          <p className="text-xs text-text-muted">{description}</p>
        </div>
      </header>

      {total === 0 ? (
        <div className="px-5 pb-6 pt-2">
          <p className="text-xs text-text-muted">Sin sesiones registradas en el período.</p>
        </div>
      ) : (
        <ol className="px-5 pb-5 pt-3 space-y-4">
          {steps.map((step, i) => {
            const previousStage = i > 0 ? stages[i - 1]! : null;
            const delta = step.pctOfPrevious === null ? null : step.pctOfPrevious - 100;
            // Already guaranteed in [0, 100] by funnelBarWidthsPct — no
            // re-clamp needed here (see that function's doc comment).
            const barWidthPct = barWidths[i]!;

            return (
              <li key={step.stage}>
                <div className="flex items-baseline justify-between gap-3 mb-1.5">
                  <span className="text-sm font-medium text-text-strong">
                    {FUNNEL_STAGE_LABEL[step.stage]}
                  </span>
                  <span className="flex items-baseline gap-2">
                    <span className="num-tab text-sm text-text-strong">
                      {step.count.toLocaleString('es-PY')}
                    </span>
                    {previousStage && delta !== null && (
                      <span
                        className={
                          'num-tab text-xs font-medium ' +
                          (delta < 0
                            ? 'text-rose-400'
                            : delta > 0
                              ? 'text-emerald-400'
                              : 'text-text-muted')
                        }
                      >
                        {delta === 0
                          ? `sin caída vs ${FUNNEL_STAGE_LABEL[previousStage]}`
                          : `${delta > 0 ? '+' : ''}${delta}% vs ${FUNNEL_STAGE_LABEL[previousStage]}`}
                      </span>
                    )}
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-bg-deep/60 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-text-strong/80 transition-[width] duration-500"
                    style={{ width: `${barWidthPct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
