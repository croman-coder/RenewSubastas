import { Filter } from 'lucide-react';
import { FUNNEL_STAGE_LABEL } from '@/lib/insights/format';
import {
  buildFunnelSteps,
  funnelBarWidthsPct,
  FUNNEL_STAGES,
  type FunnelStage,
} from '@/lib/insights/traffic-summary';

interface Props {
  funnel: Record<FunnelStage, number>;
  /** Days folded into `funnel`, for the subtitle only. */
  days: number;
}

/**
 * The block the rest of the panel exists to set up. Counts alone ("400
 * people came in") don't answer Croman's actual question — where the drop
 * happens does. Each row shows the stage's own count (bar width, relative
 * to whichever stage in the funnel is LARGEST — see `funnelBarWidthsPct`,
 * deliberately not relative to `home` specifically) AND the step-over-step
 * change versus the stage right before it, so a reader sees both "how big"
 * and "what just happened here" without doing the division themselves.
 *
 * `pctOfPrevious` can exceed 100 (rendered as a "+" gain, emerald, not
 * clamped to a drop) precisely because an ad can link straight to a vehicle
 * detail page, skipping `catalog` entirely for that session — funnel counts
 * are independent per-stage distinct-session counts, not a strict nested
 * subset (see aggregateTraffic.ts). Treating every step as a same-or-lower
 * drop would silently mislabel real traffic shape as a data bug. The same
 * fact is why bar width is sized off the funnel's own max, not off `home`:
 * a day where every session lands directly on a vehicle detail page (home
 * count 0) is that same expected shape, and every bar collapsing to 0%
 * while the count beside it reads 200 is exactly the "numbers right, chart
 * looking broken" failure this screen exists to avoid.
 */
export function TrafficFunnel({ funnel, days }: Props) {
  const steps = buildFunnelSteps(funnel);
  const barWidths = funnelBarWidthsPct(funnel);
  const total = steps.reduce((acc, s) => acc + s.count, 0);

  return (
    <section className="rounded-xl border border-text-subtle/15 bg-bg-elev/40">
      <header className="flex items-center gap-2.5 px-5 pt-5 pb-1">
        <span className="w-7 h-7 rounded-md bg-text-strong/[0.06] text-text-strong grid place-items-center ring-1 ring-text-subtle/20">
          <Filter className="w-3.5 h-3.5" strokeWidth={2.25} />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-text-strong tracking-tight">Embudo</h2>
          <p className="text-xs text-text-muted">
            Sesiones por paso · últimos {days} día{days === 1 ? '' : 's'}
          </p>
        </div>
      </header>

      {total === 0 ? (
        <div className="px-5 pb-6 pt-2">
          <p className="text-xs text-text-muted">Sin sesiones registradas en el período.</p>
        </div>
      ) : (
        <ol className="px-5 pb-5 pt-3 space-y-4">
          {steps.map((step, i) => {
            const previousStage = i > 0 ? FUNNEL_STAGES[i - 1]! : null;
            const delta = step.pctOfPrevious === null ? null : step.pctOfPrevious - 100;
            // Already guaranteed in [0, 100] by funnelBarWidthsPct — no
            // re-clamp needed here (see that function's doc comment).
            const barWidthPct = barWidths[step.stage];

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
