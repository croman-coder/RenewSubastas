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

/** Every funnel stage, in the order `functions/src/insights/aggregateTraffic.ts`
 *  stores them in `funnel`. This is the full stored key set for building/
 *  summing the record — it is NOT "the funnel" to render; see
 *  `ANONYMOUS_FUNNEL_STAGES` / `SIGNED_IN_FUNNEL_STAGES` below for that. */
export const FUNNEL_STAGES: readonly FunnelStage[] = ['home', 'catalog', 'detail', 'login'];
const SOURCES: readonly Source[] = ['ig', 'fb', 'google', 'direct', 'other'];

/**
 * The two journeys this app's routing can actually produce — NOT one
 * four-stage funnel. Verified directly against the route code, not assumed:
 *
 * - `apps/web/src/app/[locale]/page.tsx` calls `getOptionalUser()` and
 *   `redirect()`s away IF a session exists — so `home` is recorded ONLY for
 *   visitors with no session.
 * - `/auctions` and `/auctions/[id]` live under `(protected)`, whose layout
 *   renders `<AppShell>`, which calls `getCurrentUser()`
 *   (`apps/web/src/lib/auth/server.ts`) — `if (!cookie) redirect('/login')`.
 *   So `catalog` and `detail` are recorded ONLY for signed-in users; an
 *   anonymous click straight into either — e.g. an Instagram ad linking to a
 *   specific vehicle's detail page — is redirected to `/login` before either
 *   page ever renders, and is recorded as a `login` view, not a `detail`
 *   view.
 *
 * `home` and `catalog`/`detail` therefore describe two essentially disjoint
 * populations (anonymous vs. already-signed-in). A percentage computed
 * BETWEEN them (e.g. "catalog as a share of home") isn't measuring visitor
 * drop-off — it's measuring the login wall, since almost nobody can be in
 * both buckets on the same day. `login` sits with the anonymous group: it's
 * where an anonymous session ends up whether it clicks "iniciar sesión"
 * from the home page or gets redirected off `/auctions`(`/{id}`) for having
 * no session — either way, a session recorded here has not yet
 * authenticated.
 */
export const ANONYMOUS_FUNNEL_STAGES: readonly FunnelStage[] = ['home', 'login'];

/** The other journey: real browsing behaviour, but only of people who
 *  already have an account (see `ANONYMOUS_FUNNEL_STAGES` above for the
 *  verified routing reasoning). The design doc's worked example — "400 saw
 *  the catalog, 90 opened a listing" — describes exactly this group; a
 *  plain visitor cannot generate a `catalog` or `detail` view at all. */
export const SIGNED_IN_FUNNEL_STAGES: readonly FunnelStage[] = ['catalog', 'detail'];

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
  /** Share of the group's FIRST stage count (the first entry of whichever
   *  `stages` list was passed to `buildFunnelSteps`). `null` when that
   *  first stage's own count is 0 — "% of zero" isn't a meaningful number,
   *  not a coerced 0%. */
  pctOfFirst: number | null;
  /** Share retained versus the stage immediately before this one in the
   *  same `stages` list. `null` for the first stage (nothing precedes it)
   *  and whenever the previous stage's count is 0, for the same reason as
   *  `pctOfFirst`. */
  pctOfPrevious: number | null;
}

/** `count / base` as a rounded percentage, or `null` when `base` is 0. */
function pct(count: number, base: number): number | null {
  return base > 0 ? Math.round((count / base) * 100) : null;
}

/**
 * Turns a raw `funnel` record into the ordered rows a panel renders for ONE
 * journey — pass `ANONYMOUS_FUNNEL_STAGES` or `SIGNED_IN_FUNNEL_STAGES`
 * (never the full `FUNNEL_STAGES`, see the comment on those constants for
 * why: they cover two essentially disjoint populations, and a percentage
 * computed across both measures the login wall, not visitor drop-off).
 * `stages` has no default on purpose — every call site must say which
 * journey it means.
 *
 * Pre-computes both percentages so the component stays presentation-only.
 * This — not the raw counts — is what turns "400 people showed up" into a
 * decision: where, specifically, does the drop happen.
 */
export function buildFunnelSteps(
  funnel: Record<FunnelStage, number>,
  stages: readonly FunnelStage[],
): FunnelStepStat[] {
  const firstStage = stages[0]!;
  const firstCount = funnel[firstStage];

  return stages.map((stage, i) => {
    const count = funnel[stage];
    const previousStage = i > 0 ? stages[i - 1]! : null;
    return {
      stage,
      count,
      pctOfFirst: pct(count, firstCount),
      pctOfPrevious: previousStage ? pct(count, funnel[previousStage]) : null,
    };
  });
}

/**
 * Bar-width percentage for each stage in `stages`, IN ORDER, sized against
 * the LARGEST count among just those stages — deliberately NOT against
 * `stages[0]` specifically. Returns one number per entry of `stages` (same
 * order), so it lines up index-for-index with
 * `buildFunnelSteps(funnel, stages)` — pass the SAME `stages` list to both.
 *
 * This answers a different question than `FunnelStepStat.pctOfFirst` above.
 * `pctOfFirst` answers "what share of this group's first stage reached this
 * stage", and is honestly `null` when that first stage's count is 0 — there
 * is no meaningful "% of zero". That's the right answer for the drop-off
 * TEXT. But a bar chart still has to size every bar by SOMETHING, and a
 * zero first stage is not a corner case for the anonymous journey
 * (`home` -> `login`, see `ANONYMOUS_FUNNEL_STAGES`): Santa Rosa's
 * Instagram ads often link straight to a specific vehicle's detail page,
 * and that route redirects an anonymous click to `/login` before anything
 * else renders — so that visit is recorded as a `login` view, not a
 * `detail` view, and `home` for that session is 0 (verified against the
 * actual route code, see `ANONYMOUS_FUNNEL_STAGES`'s comment — an earlier
 * version of this comment guessed the mechanism was "ads skip straight to
 * `detail`", which is wrong: the redirect fires before `detail` is ever
 * recorded at all). A day built entirely from clicks like that has
 * `home: 0, login: 200`. Sizing bars off `pctOfFirst` there collapsed BOTH
 * bars to 0% width while the count next to `login` still read 200 —
 * numbers right, chart looking broken, on exactly the screen this feature
 * exists to prove the ad spend works.
 *
 * Every returned value is in `[0, 100]` by construction (each stage's count
 * divided by the max of the given stages can never exceed 1, and counts are
 * never negative) — callers do not need to re-clamp. Returns 0 for every
 * stage, never `NaN`, when every given stage's count is 0.
 */
export function funnelBarWidthsPct(
  funnel: Record<FunnelStage, number>,
  stages: readonly FunnelStage[],
): number[] {
  const max = Math.max(...stages.map((stage) => funnel[stage]));
  if (max <= 0) return stages.map(() => 0);
  return stages.map((stage) => Math.max(0, Math.min(100, Math.round((funnel[stage] / max) * 100))));
}
