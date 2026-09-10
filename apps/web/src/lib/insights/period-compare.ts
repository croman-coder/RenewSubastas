/**
 * Pure logic for the period-vs-period comparison on `/staff/insights`:
 * range presets, URL-parameter parsing, and the arithmetic that turns two
 * periods' totals into comparison rows.
 *
 * No Firestore import and no `server-only` — deliberately split from
 * `load-period-comparison.ts` (which has both) so every rule here is unit
 * tested directly, same split as `traffic-summary.ts` vs `load-traffic.ts`.
 */

import { addDays, daysInclusive, firstOfMonth, isDateKey, lastOfMonth } from './paraguay-day';
import type { FunnelStage, Source } from './traffic-summary';

/** Inclusive range of Paraguay-local calendar days. Both ends are `YYYY-MM-DD`. */
export interface DateRange {
  from: string;
  to: string;
}

/** The two ranges being compared. `a` is the recent/current period, `b` the
 *  one it is measured against — every delta in this module is "A relative
 *  to B", never the reverse. */
export interface PeriodPair {
  a: DateRange;
  b: DateRange;
}

export type PresetKey = '7d' | '14d' | '30d' | 'mes';

export const PRESET_KEYS: readonly PresetKey[] = ['7d', '14d', '30d', 'mes'];

export const PRESET_LABEL: Record<PresetKey, string> = {
  '7d': '7 vs 7 días',
  '14d': '14 vs 14 días',
  '30d': '30 vs 30 días',
  mes: 'Mes vs mes',
};

/**
 * Hard cap on how many days one period may span.
 *
 * Not a UI nicety — each period is one Firestore range query over
 * `insights_traffic_daily` plus one over `users`, both of which bill per
 * document read, and the ranges arrive from a user-editable query string. A
 * bookmark reading `?af=1970-01-01` would otherwise scan every aggregate the
 * project will ever hold. 400 days is comfortably more than a year-over-year
 * comparison needs while keeping the worst case bounded.
 */
export const MAX_PERIOD_DAYS = 400;

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

/**
 * The two ranges for a preset, relative to `todayKey` (the Paraguay-local
 * date right now).
 *
 * Every preset ends at YESTERDAY, never today. Today is deliberately
 * excluded because it is not in `insights_traffic_daily` at all — the
 * scheduler rolls a day up at 09:30 the following morning
 * (`functions/src/insights/aggregateTraffic.ts`), so today's traffic lives
 * only in the live `page_views` snapshot that `load-traffic.ts` reads
 * separately. Including today would silently contribute a zero traffic day
 * to one side of the comparison and make the current period look worse than
 * it is. (Yesterday can also still be missing when this runs before 09:30 —
 * that one is unavoidable, so the loader reports per-period coverage and the
 * panel says so, rather than this function guessing at the clock.)
 *
 * The `'mes'` preset compares equal-length windows anchored to each month's
 * first day — month-to-date against the SAME opening stretch of the previous
 * month — not month-to-date against a full previous month. Comparing 9 days
 * against 31 would show a "drop" every single time until the month ended.
 * On the 1st of a month there is no closed month-to-date day at all, so it
 * falls back to the last two complete calendar months.
 */
export function presetRange(preset: PresetKey, todayKey: string): PeriodPair {
  const yesterday = addDays(todayKey, -1);

  if (preset === 'mes') {
    const monthStart = firstOfMonth(todayKey);
    if (yesterday < monthStart) {
      // Today is the 1st: nothing closed this month yet. Compare the last
      // two complete months instead of an empty range against anything.
      const prevMonthEnd = addDays(monthStart, -1);
      const prevMonthStart = firstOfMonth(prevMonthEnd);
      const prevPrevEnd = addDays(prevMonthStart, -1);
      return {
        a: { from: prevMonthStart, to: prevMonthEnd },
        b: { from: firstOfMonth(prevPrevEnd), to: prevPrevEnd },
      };
    }
    const len = daysInclusive(monthStart, yesterday);
    const prevMonthStart = firstOfMonth(addDays(monthStart, -1));
    // Clamp to the previous month's real length: month-to-date on the 31st
    // of March has no 31st of February to line up against.
    const prevMonthEnd = lastOfMonth(prevMonthStart);
    const prevTo = addDays(prevMonthStart, len - 1);
    return {
      a: { from: monthStart, to: yesterday },
      b: { from: prevMonthStart, to: prevTo < prevMonthEnd ? prevTo : prevMonthEnd },
    };
  }

  const len = preset === '7d' ? 7 : preset === '14d' ? 14 : 30;
  return {
    a: { from: addDays(yesterday, -(len - 1)), to: yesterday },
    b: { from: addDays(yesterday, -(2 * len - 1)), to: addDays(yesterday, -len) },
  };
}

// ---------------------------------------------------------------------------
// URL parameters
// ---------------------------------------------------------------------------

/** What `parsePeriodParams` resolved the query string to. */
export interface ResolvedPeriods extends PeriodPair {
  /** The preset that produced these ranges, or `null` when the ranges came
   *  from explicit `af`/`at`/`bf`/`bt` parameters. */
  preset: PresetKey | null;
}

export interface PeriodSearchParams {
  p?: string | string[] | undefined;
  af?: string | string[] | undefined;
  at?: string | string[] | undefined;
  bf?: string | string[] | undefined;
  bt?: string | string[] | undefined;
}

/** Next.js hands a repeated query parameter as an array; take the first. */
function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Resolves the query string into two ranges.
 *
 * Fail-soft by design: this feeds a staff report, not a mutation, and the
 * parameters are hand-editable in the address bar. Anything malformed —
 * a bad date, an inverted range, a range longer than `MAX_PERIOD_DAYS`, a
 * `to` in the future, an unknown preset — falls back to the `'7d'` preset
 * rather than erroring the page. Each of the four custom parameters must be
 * present and valid for the custom path to be taken; a half-filled set is
 * not silently completed with defaults, because a range half chosen by the
 * user and half invented here is the one result nobody could interpret.
 */
export function parsePeriodParams(
  params: PeriodSearchParams | undefined,
  todayKey: string,
): ResolvedPeriods {
  const fallback = (): ResolvedPeriods => ({ ...presetRange('7d', todayKey), preset: '7d' });
  if (!params) return fallback();

  const af = one(params.af);
  const at = one(params.at);
  const bf = one(params.bf);
  const bt = one(params.bt);

  if (af !== undefined || at !== undefined || bf !== undefined || bt !== undefined) {
    if (isDateKey(af) && isDateKey(at) && isDateKey(bf) && isDateKey(bt)) {
      const a = { from: af, to: at };
      const b = { from: bf, to: bt };
      if (isUsableRange(a, todayKey) && isUsableRange(b, todayKey)) {
        return { a, b, preset: null };
      }
    }
    return fallback();
  }

  const p = one(params.p);
  if (p !== undefined && (PRESET_KEYS as readonly string[]).includes(p)) {
    const key = p as PresetKey;
    return { ...presetRange(key, todayKey), preset: key };
  }
  return fallback();
}

/** A range is usable when it runs forwards, is not in the future, and stays
 *  within `MAX_PERIOD_DAYS`. */
export function isUsableRange(range: DateRange, todayKey: string): boolean {
  const days = daysInclusive(range.from, range.to);
  return days >= 1 && days <= MAX_PERIOD_DAYS && range.to <= todayKey;
}

/** Query string (no leading `?`) that reproduces an explicit custom range. */
export function periodQueryString(pair: PeriodPair): string {
  return new URLSearchParams({
    af: pair.a.from,
    at: pair.a.to,
    bf: pair.b.from,
    bt: pair.b.to,
  }).toString();
}

// ---------------------------------------------------------------------------
// Totals and comparison rows
// ---------------------------------------------------------------------------

/** Everything measured over one period. Produced by
 *  `load-period-comparison.ts`; consumed by `buildComparisonRows` below. */
export interface PeriodTotals {
  range: DateRange;
  /** Calendar days in `range` — always the full span asked for, even where
   *  no aggregate exists. */
  days: number;
  /** Days in `range` that actually have a rolled-up traffic aggregate. Less
   *  than `days` means part of the window predates the counter (or has not
   *  been rolled up yet); the traffic numbers below cover only these days. */
  daysWithTraffic: number;
  totalViews: number;
  totalSessions: number;
  /** New buyer accounts created in `range`. Counted from `users.createdAt`,
   *  which exists independently of the traffic rollup — so this figure is
   *  complete even for days `daysWithTraffic` does not cover. */
  newUsers: number;
  /** Subset of `newUsers` that signed themselves up (Google or password)
   *  rather than being loaded by staff. */
  selfSignups: number;
  bySource: Record<Source, number>;
  funnel: Record<FunnelStage, number>;
}

/** Which underlying dataset a row's numbers come from — the two have
 *  different coverage, and the panel labels them separately. */
export type MetricSource = 'traffic' | 'users';

export interface ComparisonRow {
  key: string;
  label: string;
  /** Section heading this row belongs under. */
  group: string;
  source: MetricSource;
  a: number;
  b: number;
  /** `a - b`. */
  deltaAbs: number;
  /** Percentage change of `a` relative to `b`, rounded. `null` when `b` is 0
   *  — there is no "percent more than nothing", and coercing that to 0% (or
   *  to 100%) would invent a number. `deltaAbs` still tells the true story
   *  in that case. */
  deltaPct: number | null;
}

/** `(a - b) / b` as a rounded percentage, or `null` when `b` is 0. */
export function deltaPct(a: number, b: number): number | null {
  if (b === 0) return null;
  return Math.round(((a - b) / b) * 100);
}

/** Per-day average over `days`, to one decimal. 0 when `days` is 0. */
export function perDay(total: number, days: number): number {
  if (days <= 0) return 0;
  return Math.round((total / days) * 10) / 10;
}

/**
 * True when the two periods span a different number of days, which makes
 * their raw totals incomparable — the panel shows the per-day averages and
 * says so instead of quietly presenting "más visitas" that only means "más
 * días".
 */
export function lengthsDiffer(a: PeriodTotals, b: PeriodTotals): boolean {
  return a.days !== b.days;
}

interface MetricDef {
  key: string;
  label: string;
  group: string;
  source: MetricSource;
  pick: (p: PeriodTotals) => number;
}

/**
 * Every metric the platform actually records, in reading order.
 *
 * The funnel entries are labelled with their real population, not as one
 * four-step funnel: this app's routing makes `home`/`login` (anonymous) and
 * `catalog`/`detail` (signed-in only) two essentially disjoint groups — see
 * `ANONYMOUS_FUNNEL_STAGES` in `traffic-summary.ts` for the routing evidence.
 * They are listed here as independent counters that each get their own
 * A-vs-B comparison; no row is ever divided by another.
 */
const METRICS: readonly MetricDef[] = [
  {
    key: 'views',
    label: 'Visitas',
    group: 'Tráfico',
    source: 'traffic',
    pick: (p) => p.totalViews,
  },
  {
    key: 'sessions',
    label: 'Sesiones',
    group: 'Tráfico',
    source: 'traffic',
    pick: (p) => p.totalSessions,
  },
  {
    key: 'newUsers',
    label: 'Usuarios nuevos',
    group: 'Registros',
    source: 'users',
    pick: (p) => p.newUsers,
  },
  {
    key: 'selfSignups',
    label: 'Se registraron solos',
    group: 'Registros',
    source: 'users',
    pick: (p) => p.selfSignups,
  },
  {
    key: 'src_ig',
    label: 'Instagram',
    group: 'Origen',
    source: 'traffic',
    pick: (p) => p.bySource.ig,
  },
  {
    key: 'src_fb',
    label: 'Facebook',
    group: 'Origen',
    source: 'traffic',
    pick: (p) => p.bySource.fb,
  },
  {
    key: 'src_google',
    label: 'Google',
    group: 'Origen',
    source: 'traffic',
    pick: (p) => p.bySource.google,
  },
  {
    key: 'src_direct',
    label: 'Directo',
    group: 'Origen',
    source: 'traffic',
    pick: (p) => p.bySource.direct,
  },
  {
    key: 'src_other',
    label: 'Otro',
    group: 'Origen',
    source: 'traffic',
    pick: (p) => p.bySource.other,
  },
  {
    key: 'fn_home',
    label: 'Home (anónimos)',
    group: 'Recorrido',
    source: 'traffic',
    pick: (p) => p.funnel.home,
  },
  {
    key: 'fn_login',
    label: 'Login (anónimos)',
    group: 'Recorrido',
    source: 'traffic',
    pick: (p) => p.funnel.login,
  },
  {
    key: 'fn_catalog',
    label: 'Catálogo (con sesión)',
    group: 'Recorrido',
    source: 'traffic',
    pick: (p) => p.funnel.catalog,
  },
  {
    key: 'fn_detail',
    label: 'Fichas (con sesión)',
    group: 'Recorrido',
    source: 'traffic',
    pick: (p) => p.funnel.detail,
  },
];

/** Group headings in render order — derived from `METRICS` so the two can
 *  never drift apart. */
export function comparisonGroups(): string[] {
  return [...new Set(METRICS.map((m) => m.group))];
}

/** One row per metric, comparing period `a` against period `b`. */
export function buildComparisonRows(a: PeriodTotals, b: PeriodTotals): ComparisonRow[] {
  return METRICS.map((m) => {
    const av = m.pick(a);
    const bv = m.pick(b);
    return {
      key: m.key,
      label: m.label,
      group: m.group,
      source: m.source,
      a: av,
      b: bv,
      deltaAbs: av - bv,
      deltaPct: deltaPct(av, bv),
    };
  });
}
