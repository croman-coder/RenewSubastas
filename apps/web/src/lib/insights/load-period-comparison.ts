import 'server-only';
import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { daysInclusive, eachDate, paraguayDateKey, paraguayRangeMs } from './paraguay-day';
import type { DateRange, PeriodTotals } from './period-compare';
import type { FunnelStage, Source, TrafficDailyAggregate } from './traffic-summary';

const SOURCES: readonly Source[] = ['ig', 'fb', 'google', 'direct', 'other'];
const FUNNEL_STAGES: readonly FunnelStage[] = ['home', 'catalog', 'detail', 'login'];

function zeroRecord<K extends string>(keys: readonly K[]): Record<K, number> {
  const rec = {} as Record<K, number>;
  for (const k of keys) rec[k] = 0;
  return rec;
}

/** One day of the day-by-day register under the comparison table. */
export interface PeriodDailyRow {
  date: string;
  /** `null` — not 0 — when no aggregate exists for this day: the counter had
   *  not started yet, or the 09:30 rollup has not run. "No medimos" and
   *  "midieron cero visitas" are different facts and the table says which. */
  views: number | null;
  sessions: number | null;
  /** Never null: `users.createdAt` is not part of the traffic rollup, so a
   *  day with no signups genuinely has 0. */
  newUsers: number;
}

export interface PeriodResult {
  totals: PeriodTotals;
  daily: PeriodDailyRow[];
}

export interface PeriodComparison {
  a: PeriodResult;
  b: PeriodResult;
  /** Oldest rolled-up day that exists at all, or `null` when the collection
   *  is still empty. Lets the panel say "no hay datos antes del X" instead
   *  of showing a period of silent zeros. */
  earliestTrafficDate: string | null;
}

/**
 * A new buyer account, reduced to the two facts this report needs.
 * `createdBy` distinguishes a self-service signup from an account a staff
 * member loaded by hand — see `selfSignups` below.
 */
interface NewUser {
  dateKey: string;
  self: boolean;
}

/**
 * Counts of new BUYER accounts per Paraguay-local day in `range`.
 *
 * Role is filtered in memory rather than with a `where('role','==','buyer')`
 * clause on purpose: combining it with the `createdAt` inequality would make
 * this a composite query needing an entry in `firestore.indexes.json`, and
 * the whole `users` collection is in the low hundreds of documents — the
 * range filter already narrows the read to accounts created inside the
 * window. Revisit if `users` ever reaches the tens of thousands.
 *
 * Internal accounts (admin/staff/finanzas) are excluded because "usuarios
 * nuevos" on a traffic report means people who arrived and signed up, not
 * colleagues who were given a login.
 */
async function loadNewUsers(db: FirebaseFirestore.Firestore, range: DateRange): Promise<NewUser[]> {
  const { startMs, endMs } = paraguayRangeMs(range.from, range.to);
  const snap = await db
    .collection('users')
    // Single-field inequality, no orderBy on another field — always
    // auto-indexed, same shape as the `page_views` query in load-traffic.ts.
    .where('createdAt', '>=', Timestamp.fromMillis(startMs))
    .where('createdAt', '<', Timestamp.fromMillis(endMs))
    .select('createdAt', 'role', 'createdBy')
    .get();

  const out: NewUser[] = [];
  for (const doc of snap.docs) {
    if (doc.get('role') !== 'buyer') continue;
    const createdAt = doc.get('createdAt') as Timestamp | undefined;
    if (!createdAt) continue;
    const createdBy = doc.get('createdBy');
    out.push({
      dateKey: paraguayDateKey(createdAt.toMillis()),
      // `createdBy` is 'self:google' / 'self:password' for a self-service
      // signup, and the uid of the staff member otherwise (plus 'bootstrap'
      // for the very first admin). Prefix match, so a future 'self:*' method
      // counts correctly without touching this file.
      self: typeof createdBy === 'string' && createdBy.startsWith('self:'),
    });
  }
  return out;
}

/** Rolled-up traffic aggregates for `range`, keyed by date. Days with no
 *  aggregate are simply absent from the map — never zero-filled. */
async function loadTrafficRange(
  db: FirebaseFirestore.Firestore,
  range: DateRange,
): Promise<Map<string, TrafficDailyAggregate>> {
  const snap = await db
    .collection('insights_traffic_daily')
    // `date` is a `YYYY-MM-DD` string, so lexicographic ordering IS calendar
    // ordering and a string range filter is exact. Single field, always
    // auto-indexed.
    .where('date', '>=', range.from)
    .where('date', '<=', range.to)
    .get();

  const map = new Map<string, TrafficDailyAggregate>();
  for (const doc of snap.docs) {
    const data = doc.data() as TrafficDailyAggregate;
    map.set(data.date, data);
  }
  return map;
}

function foldPeriod(
  range: DateRange,
  traffic: Map<string, TrafficDailyAggregate>,
  users: NewUser[],
): PeriodResult {
  const bySource = zeroRecord(SOURCES);
  const funnel = zeroRecord(FUNNEL_STAGES);
  let totalViews = 0;
  let totalSessions = 0;

  const usersByDate = new Map<string, { total: number; self: number }>();
  let newUsers = 0;
  let selfSignups = 0;
  for (const u of users) {
    newUsers += 1;
    if (u.self) selfSignups += 1;
    const bucket = usersByDate.get(u.dateKey) ?? { total: 0, self: 0 };
    bucket.total += 1;
    if (u.self) bucket.self += 1;
    usersByDate.set(u.dateKey, bucket);
  }

  const daily: PeriodDailyRow[] = eachDate(range.from, range.to).map((date) => {
    const agg = traffic.get(date);
    if (agg) {
      totalViews += agg.totalViews;
      totalSessions += agg.uniqueSessions;
      for (const s of SOURCES) bySource[s] += agg.bySource?.[s] ?? 0;
      for (const f of FUNNEL_STAGES) funnel[f] += agg.funnel?.[f] ?? 0;
    }
    return {
      date,
      views: agg ? agg.totalViews : null,
      sessions: agg ? agg.uniqueSessions : null,
      newUsers: usersByDate.get(date)?.total ?? 0,
    };
  });

  return {
    totals: {
      range,
      days: daysInclusive(range.from, range.to),
      daysWithTraffic: daily.filter((d) => d.views !== null).length,
      totalViews,
      totalSessions,
      newUsers,
      selfSignups,
      bySource,
      funnel,
    },
    daily,
  };
}

/**
 * Loads both sides of the period comparison on `/staff/insights`.
 *
 * Two datasets with two different coverages, kept distinct all the way to
 * the panel rather than blended into one "período" number:
 *
 * - Traffic (`insights_traffic_daily`) exists only from the day the counter
 *   was deployed, and only for days the 09:30 scheduler has already rolled
 *   up. A requested day with no aggregate is reported as `null`, never 0 —
 *   `PeriodTotals.daysWithTraffic` says how many of the requested days the
 *   traffic figures actually cover.
 * - Signups (`users.createdAt`) go back to the first account ever created
 *   and are complete for every day, including today.
 *
 * Four range queries, all single-field and therefore auto-indexed, issued in
 * parallel. Ranges are already validated and length-capped by
 * `parsePeriodParams` / `MAX_PERIOD_DAYS` before reaching here.
 */
export async function loadPeriodComparison(a: DateRange, b: DateRange): Promise<PeriodComparison> {
  const db = getFirestore(getAdminApp());

  const [trafficA, trafficB, usersA, usersB, earliestSnap] = await Promise.all([
    loadTrafficRange(db, a),
    loadTrafficRange(db, b),
    loadNewUsers(db, a),
    loadNewUsers(db, b),
    db.collection('insights_traffic_daily').orderBy('date', 'asc').limit(1).get(),
  ]);

  return {
    a: foldPeriod(a, trafficA, usersA),
    b: foldPeriod(b, trafficB, usersB),
    earliestTrafficDate: earliestSnap.empty
      ? null
      : ((earliestSnap.docs[0]!.data() as TrafficDailyAggregate).date ?? null),
  };
}
