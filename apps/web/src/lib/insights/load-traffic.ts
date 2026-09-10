import 'server-only';
import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import {
  summarizeTrafficHistory,
  type TrafficDailyAggregate,
  type TrafficHistorySummary,
} from './traffic-summary';
import { paraguayDateKey, paraguayDayRangeMs } from './paraguay-day';

/**
 * Paraguay-local day arithmetic lives in `./paraguay-day.ts` — pure, unit
 * tested, and shared with `load-period-comparison.ts`. This file used to
 * carry its own private copy of the UTC-3 offset and the two helpers below;
 * it doesn't any more, so there is one definition of "a Paraguay day" for
 * all of `apps/web`'s traffic loaders instead of one per loader.
 *
 * It MUST agree exactly with `functions/src/insights/aggregateTraffic.ts`'s
 * notion of a day (the cross-workspace reason the fact is stated in both
 * places is documented there), or a page view near local midnight could be
 * silently dropped from both "today's live count" and the next day's
 * rollup, or double counted in both.
 */

/** UTC epoch-ms for 00:00 of the Paraguay-local calendar day containing `nowMs`. */
function paraguayTodayStartMs(nowMs: number): number {
  return paraguayDayRangeMs(paraguayDateKey(nowMs)).startMs;
}

/** Live, still-accumulating snapshot of the current Paraguay-local day. */
export interface TrafficTodaySnapshot {
  /** Paraguay-local calendar date this snapshot covers. */
  date: string;
  /** Raw `page_views` docs counted so far today. PARTIAL — the day hasn't
   *  closed and won't be rolled into `insights_traffic_daily` until
   *  09:30 America/Asuncion tomorrow. */
  views: number;
  /** Distinct `sessionId`s seen so far today. Same partial caveat as `views`. */
  sessions: number;
}

export interface TrafficInsights {
  /** Live snapshot of the day in progress. Never merge this into `history`
   *  — it is not a complete day, and doing so would silently misreport a
   *  partial day as a finished one. */
  today: TrafficTodaySnapshot;
  /** Complete daily aggregates, OLDEST FIRST, for as many of the last 30
   *  Paraguay-local days as `aggregateTraffic` has actually rolled up.
   *  Empty until the scheduler has run at least once — never padded with
   *  zeroed placeholder days, so the panel can tell "no data yet" apart
   *  from "zero traffic that day". */
  history: TrafficDailyAggregate[];
  /** Sums over `history` (see `traffic-summary.ts`). `summary.days` may be
   *  less than 30, or 0. */
  summary: TrafficHistorySummary;
}

/**
 * Loads everything `/staff/insights` needs to render the anonymous
 * web-traffic counter block: up to the last 30 rolled-up days from
 * `insights_traffic_daily`, plus a LIVE read of today's still-uncounted
 * `page_views`.
 *
 * Two different sources with two different degrees of trustworthiness —
 * `history` is closed and complete (`aggregateTraffic` already finished
 * that day and deleted its raw events), `today` is a live snapshot of a day
 * still in progress. They are kept as separate fields, never merged into
 * one array or one number, specifically so the panel cannot present a
 * partial day as if it were a complete one (design doc,
 * docs/superpowers/specs/2026-08-08-trafico-web-design.md).
 *
 * Both queries are single-field (one `orderBy` with no `where`, and one
 * `where` with no `orderBy`) — Firestore auto-indexes every field for
 * exactly this shape, so neither needs an entry in `firestore.indexes.json`.
 * See task-5-report.md for the deployed-index check.
 *
 * `nowMs` is injectable (defaults to `Date.now()`) purely so a caller could
 * pin it in a test; this loader itself has no test (it is `server-only` and
 * hits Firestore — see `traffic-summary.ts` for the pure logic that IS
 * tested directly).
 */
export async function loadTrafficInsights(nowMs: number = Date.now()): Promise<TrafficInsights> {
  const db = getFirestore(getAdminApp());
  const todayStartMs = paraguayTodayStartMs(nowMs);

  const [historySnap, todaySnap] = await Promise.all([
    // Last 30 rolled-up days. Single-field orderBy + limit, no `where` at
    // all — always auto-indexed.
    db.collection('insights_traffic_daily').orderBy('date', 'desc').limit(30).get(),
    // Today's raw events so far. Single inequality on one field, no
    // `orderBy` — also always auto-indexed. Field-masked to `sessionId`
    // only: that is the one field needed (to dedupe into `sessions`) beyond
    // the doc count itself (`views`), so there is no reason to pull
    // `pathKind`/`source`/`auctionId`/`at` off the wire for every view of
    // the day.
    db
      .collection('page_views')
      .where('at', '>=', Timestamp.fromMillis(todayStartMs))
      .select('sessionId')
      .get(),
  ]);

  // Oldest -> newest, so the panel's chart reads left-to-right chronologically.
  const history: TrafficDailyAggregate[] = historySnap.docs
    .map((doc) => doc.data() as TrafficDailyAggregate)
    .reverse();

  const todaySessions = new Set<string>();
  for (const doc of todaySnap.docs) {
    const sessionId = doc.data()['sessionId'] as string | undefined;
    if (sessionId) todaySessions.add(sessionId);
  }

  return {
    today: {
      date: paraguayDateKey(nowMs),
      views: todaySnap.size,
      sessions: todaySessions.size,
    },
    history,
    summary: summarizeTrafficHistory(history),
  };
}
