/**
 * Pure, side-effect-free shapes and arithmetic for the anonymous web-traffic
 * counter's block on `/staff/insights`. No Firestore import, no
 * `server-only` — deliberately split out from `load-traffic.ts` (which has
 * both) so this file can be unit tested directly, the same reason
 * `functions/src/insights/log-page-view-rules.ts` is split from
 * `logPageView.ts`.
 */

/**
 * Mirrors `PathKind` in `functions/src/insights/log-page-view-rules.ts`.
 * Cannot be imported directly: `apps/web` and `functions` are separate pnpm
 * workspaces (see the identical note on `PARAGUAY_UTC_OFFSET_HOURS` in
 * `functions/src/insights/aggregateTraffic.ts`), so this is a second,
 * deliberate, EXPLICIT copy of the same closed set — not a silent guess at
 * its shape.
 */
export type PathKind = 'home' | 'catalog' | 'detail' | 'login' | 'other';

/** Mirrors `Source` in the same file, for the same cross-workspace reason. */
export type Source = 'ig' | 'fb' | 'google' | 'direct' | 'other';

/** Funnel stages: every `PathKind` except `'other'`. Mirrors `FunnelStage`
 *  in `functions/src/insights/aggregateTraffic.ts`. */
export type FunnelStage = Exclude<PathKind, 'other'>;

/** Order matters: this IS the funnel's step order, first-to-last. */
export const FUNNEL_STAGES: readonly FunnelStage[] = ['home', 'catalog', 'detail', 'login'];
const SOURCES: readonly Source[] = ['ig', 'fb', 'google', 'direct', 'other'];

/**
 * Mirrors `TrafficDailyAggregate` in `functions/src/insights/aggregateTraffic.ts`
 * (minus `updatedAt`, which the panel never reads) — the exact shape persisted
 * to `insights_traffic_daily/{date}`.
 */
export interface TrafficDailyAggregate {
  date: string;
  totalViews: number;
  uniqueSessions: number;
  byPathKind: Record<PathKind, number>;
  bySource: Record<Source, number>;
  funnel: Record<FunnelStage, number>;
}

/** Totals over a window of complete daily aggregates. */
export interface TrafficHistorySummary {
  /** Number of days actually folded in — NOT always 30. The scheduler may
   *  not have run every day (or ever), and this is never padded with
   *  zeroed placeholder days. */
  days: number;
  totalViews: number;
  /**
   * Sum of each day's OWN `uniqueSessions`. This is NOT a dedupe across
   * days — by design, a visitor returning tomorrow counts as a new session
   * (docs/superpowers/specs/2026-08-08-trafico-web-design.md, "Sin
   * cookies..."). Presenting this as "unique visitors over N days" would
   * overclaim precision the underlying data doesn't have; it is exactly
   * what the aggregate already commits to, summed.
   */
  totalSessions: number;
  bySource: Record<Source, number>;
  /** Sum of each day's OWN per-stage distinct-session count — same
   *  same-day-only caveat as `totalSessions` above. */
  funnel: Record<FunnelStage, number>;
}

function zeroRecord<K extends string>(keys: readonly K[]): Record<K, number> {
  const rec = {} as Record<K, number>;
  for (const k of keys) rec[k] = 0;
  return rec;
}

/**
 * Sums daily aggregates into one totals object for the panel's "last N
 * days" figures. Pure — no I/O, no clock reads — so it is unit tested
 * directly instead of only through the (untestable outside a `server-only`
 * boundary) loader that fetches `history` in the first place.
 */
export function summarizeTrafficHistory(
  history: readonly TrafficDailyAggregate[],
): TrafficHistorySummary {
  const bySource = zeroRecord(SOURCES);
  const funnel = zeroRecord(FUNNEL_STAGES);
  let totalViews = 0;
  let totalSessions = 0;

  for (const d of history) {
    totalViews += d.totalViews;
    totalSessions += d.uniqueSessions;
    for (const s of SOURCES) bySource[s] += d.bySource[s] ?? 0;
    for (const f of FUNNEL_STAGES) funnel[f] += d.funnel[f] ?? 0;
  }

  return { days: history.length, totalViews, totalSessions, bySource, funnel };
}

/** One row of the funnel visualization: a stage, its count, and its two
 *  percentages. */
export interface FunnelStepStat {
  stage: FunnelStage;
  count: number;
  /** Share of the FIRST stage's count (`home`, today). `null` when the
   *  first stage's own count is 0 — "% of zero" isn't a meaningful number,
   *  not a coerced 0%. */
  pctOfFirst: number | null;
  /** Share retained versus the stage immediately before this one in
   *  `FUNNEL_STAGES`. `null` for the first stage (nothing precedes it) and
   *  whenever the previous stage's count is 0, for the same reason as
   *  `pctOfFirst`. */
  pctOfPrevious: number | null;
}

/** `count / base` as a rounded percentage, or `null` when `base` is 0. */
function pct(count: number, base: number): number | null {
  return base > 0 ? Math.round((count / base) * 100) : null;
}

/**
 * Turns a raw `funnel` record into the ordered rows the panel renders,
 * pre-computing both percentages so the component stays presentation-only.
 * This — not the raw counts — is what turns "400 people showed up" into a
 * decision: where, specifically, does the drop happen.
 */
export function buildFunnelSteps(funnel: Record<FunnelStage, number>): FunnelStepStat[] {
  const firstStage = FUNNEL_STAGES[0]!;
  const firstCount = funnel[firstStage];

  return FUNNEL_STAGES.map((stage, i) => {
    const count = funnel[stage];
    const previousStage = i > 0 ? FUNNEL_STAGES[i - 1]! : null;
    return {
      stage,
      count,
      pctOfFirst: pct(count, firstCount),
      pctOfPrevious: previousStage ? pct(count, funnel[previousStage]) : null,
    };
  });
}
