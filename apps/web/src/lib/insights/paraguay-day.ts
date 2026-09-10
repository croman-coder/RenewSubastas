/**
 * Paraguay-local calendar-day arithmetic on `YYYY-MM-DD` keys.
 *
 * Pure — no I/O, no `server-only`, no Firestore import — so it is unit
 * tested directly and can be imported from both server loaders and
 * components. Deliberately split out from `load-traffic.ts` for the same
 * reason `traffic-summary.ts` is: that file has `server-only` at the top and
 * cannot be tested.
 *
 * Paraguay is UTC-3 year-round — daylight saving time was abolished in 2024.
 * That fact is also stated (and relied on) in
 * `functions/src/insights/aggregateTraffic.ts`, which defines what
 * "yesterday" means for the scheduler that writes `insights_traffic_daily`,
 * and in `apps/web/src/lib/format/date.ts` for display formatting. This file
 * is now the single copy for `apps/web`'s traffic loaders — `load-traffic.ts`
 * and `load-period-comparison.ts` both import from here rather than carrying
 * their own. It MUST agree exactly with `aggregateTraffic.ts`'s notion of a
 * day, or a page view near local midnight could be silently dropped from
 * both "today's live count" and the next day's rollup, or double counted in
 * both.
 *
 * If Paraguay ever reinstates DST, every function here becomes wrong at the
 * transition instants and needs a real timezone-table lookup instead of
 * fixed arithmetic; until then, treating the offset as constant is exact,
 * not approximate.
 */

export const PARAGUAY_UTC_OFFSET_HOURS = -3;

const DAY_MS = 24 * 3600_000;
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** `YYYY-MM-DD` from UTC date components — the one place the key is formatted. */
function keyFromUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/**
 * True when `value` is a syntactically well-formed `YYYY-MM-DD` key that
 * names a real calendar date.
 *
 * The regex alone is not enough: `'2026-02-31'` and `'2026-13-01'` both match
 * it. The round-trip through `Date.UTC` catches them — JS normalizes Feb 31
 * to Mar 3, so re-formatting yields a different string. This matters because
 * these keys arrive from the URL query string (a staff member editing the
 * address bar, or a stale bookmark), go straight into a Firestore range
 * filter, and a normalized-away date would silently query a window nobody
 * asked for.
 */
export function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_KEY_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  return keyFromUtc(new Date(Date.UTC(y, m - 1, d))) === value;
}

/** `YYYY-MM-DD` for the Paraguay-local calendar date containing UTC instant `utcMs`. */
export function paraguayDateKey(utcMs: number): string {
  // Shift into Paraguay-local wall-clock time, then read the components with
  // UTC getters so the host machine's own timezone (irrelevant here — Netlify
  // functions run in UTC anyway, but a dev laptop might not) can never leak in.
  return keyFromUtc(new Date(utcMs + PARAGUAY_UTC_OFFSET_HOURS * 3600_000));
}

/**
 * UTC epoch-ms `[startMs, endMs)` covering one Paraguay-local calendar day.
 * Half-open by design: callers must filter with `at >= startMs && at < endMs`,
 * never `<=`, so an event stamped at exactly the next midnight is never
 * counted into two days. Mirrors `paraguayDayRangeMs` in
 * `functions/src/insights/aggregateTraffic.ts` exactly.
 */
export function paraguayDayRangeMs(dateKey: string): { startMs: number; endMs: number } {
  const [y, m, d] = dateKey.split('-').map(Number) as [number, number, number];
  // Paraguay-local midnight (00:00, UTC-3) is 03:00 UTC the same calendar
  // date: subtracting the (negative) offset adds the 3 hours back.
  const shift = PARAGUAY_UTC_OFFSET_HOURS * 3600_000;
  return {
    startMs: Date.UTC(y, m - 1, d, 0, 0, 0) - shift,
    endMs: Date.UTC(y, m - 1, d + 1, 0, 0, 0) - shift,
  };
}

/**
 * UTC epoch-ms `[startMs, endMs)` covering the INCLUSIVE range of
 * Paraguay-local days `from`..`to`. `to` is inclusive as a calendar day —
 * `endMs` is the midnight that closes it, not the midnight that opens it.
 */
export function paraguayRangeMs(from: string, to: string): { startMs: number; endMs: number } {
  return { startMs: paraguayDayRangeMs(from).startMs, endMs: paraguayDayRangeMs(to).endMs };
}

/**
 * `dateKey` shifted by `delta` calendar days. Pure calendar arithmetic in
 * UTC — no timezone is involved, because both input and output are already
 * Paraguay-local calendar keys and every Paraguay day is exactly 24h long
 * (see the module comment). `Date.UTC` normalizes out-of-range day numbers,
 * so month and year rollover (in both directions) is handled for free.
 */
export function addDays(dateKey: string, delta: number): string {
  const [y, m, d] = dateKey.split('-').map(Number) as [number, number, number];
  return keyFromUtc(new Date(Date.UTC(y, m - 1, d + delta)));
}

/** Calendar days in the INCLUSIVE range `from`..`to`. 1 when they are equal,
 *  0 when `from` is after `to` (an empty range, never a negative count). */
export function daysInclusive(from: string, to: string): number {
  const a = paraguayDayRangeMs(from).startMs;
  const b = paraguayDayRangeMs(to).startMs;
  if (b < a) return 0;
  return Math.round((b - a) / DAY_MS) + 1;
}

/** Every `YYYY-MM-DD` in the INCLUSIVE range `from`..`to`, oldest first.
 *  Empty when `from` is after `to`. */
export function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  const n = daysInclusive(from, to);
  for (let i = 0; i < n; i++) out.push(addDays(from, i));
  return out;
}

/** First calendar day of `dateKey`'s month. */
export function firstOfMonth(dateKey: string): string {
  return `${dateKey.slice(0, 7)}-01`;
}

/** Last calendar day of `dateKey`'s month. */
export function lastOfMonth(dateKey: string): string {
  const [y, m] = dateKey.split('-').map(Number) as [number, number];
  // Day 0 of the NEXT month is the last day of this one.
  return keyFromUtc(new Date(Date.UTC(y, m, 0)));
}
