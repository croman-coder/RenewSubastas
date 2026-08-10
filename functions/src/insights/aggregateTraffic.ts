import { onSchedule } from 'firebase-functions/v2/scheduler';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '../lib/admin.js';
import type { PathKind, Source } from './log-page-view-rules.js';

// ---------------------------------------------------------------------------
// Paraguay-local day boundary
// ---------------------------------------------------------------------------

/**
 * Paraguay is UTC-3 year-round — daylight saving time was abolished in 2024.
 * `apps/web/src/lib/format/date.ts` documents and relies on the exact same
 * fact for client-side date formatting, but `functions/` is a separate pnpm
 * workspace and can't import from `apps/web` (same cross-workspace
 * constraint already documented in log-page-view-rules.ts), so this is a
 * second, deliberate, EXPLICIT copy of the one fact both sides depend on —
 * not a silent assumption. If Paraguay ever reinstates DST, this constant
 * (and the three functions below that use it) need to become a real
 * timezone-table lookup instead of fixed arithmetic; until then, treating
 * the offset as constant is exact, not approximate.
 */
const PARAGUAY_UTC_OFFSET_HOURS = -3;

const DAY_MS = 24 * 3600_000;

/** `YYYY-MM-DD` for the Paraguay-local calendar date containing UTC instant `utcMs`. */
export function paraguayDateKey(utcMs: number): string {
  // Shift into Paraguay-local wall-clock time, then read the date components
  // with UTC getters so the host machine's own timezone (irrelevant here —
  // Cloud Functions run in UTC anyway, but tests might not) can never leak in.
  const local = new Date(utcMs + PARAGUAY_UTC_OFFSET_HOURS * 3600_000);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, '0');
  const d = String(local.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * `YYYY-MM-DD` for "yesterday" relative to `nowMs`, in Paraguay local time.
 *
 * Correct specifically BECAUSE the offset is constant (no DST): shifting the
 * instant back exactly 24h and re-deriving the local date is equivalent to
 * "the Paraguay calendar day before today's Paraguay calendar day" only when
 * every day is exactly 24h long in that zone. A zone with DST would need to
 * compute today's date first and subtract one calendar day instead — see the
 * comment on `PARAGUAY_UTC_OFFSET_HOURS`.
 */
export function yesterdayDateKey(nowMs: number): string {
  return paraguayDateKey(nowMs - DAY_MS);
}

/**
 * UTC epoch-ms `[startMs, endMs)` covering one Paraguay-local calendar day.
 * `dateKey` must be `YYYY-MM-DD`. Half-open by design: callers must filter
 * with `at >= startMs && at < endMs`, never `<=`, so an event stamped at
 * exactly the next midnight is never double-counted into two days.
 */
export function paraguayDayRangeMs(dateKey: string): { startMs: number; endMs: number } {
  const parts = dateKey.split('-').map(Number);
  const y = parts[0]!;
  const m = parts[1]!;
  const d = parts[2]!;
  // Paraguay-local midnight (00:00, UTC-3) is 03:00 UTC the same calendar
  // date: subtracting the (negative) offset adds the 3 hours back.
  const startMs = Date.UTC(y, m - 1, d, 0, 0, 0) - PARAGUAY_UTC_OFFSET_HOURS * 3600_000;
  const endMs = Date.UTC(y, m - 1, d + 1, 0, 0, 0) - PARAGUAY_UTC_OFFSET_HOURS * 3600_000;
  return { startMs, endMs };
}

// ---------------------------------------------------------------------------
// Aggregate shape
// ---------------------------------------------------------------------------

/** Funnel stages: every `PathKind` except `'other'`, which is not a funnel step. */
export type FunnelStage = Exclude<PathKind, 'other'>;

const PATH_KINDS: readonly PathKind[] = ['home', 'catalog', 'detail', 'login', 'other'];
const SOURCES: readonly Source[] = ['ig', 'fb', 'google', 'direct', 'other'];
const FUNNEL_STAGES: readonly FunnelStage[] = ['home', 'catalog', 'detail', 'login'];

function zeroRecord<K extends string>(keys: readonly K[]): Record<K, number> {
  const rec = {} as Record<K, number>;
  for (const k of keys) rec[k] = 0;
  return rec;
}

function isFunnelStage(pathKind: PathKind): pathKind is FunnelStage {
  return (FUNNEL_STAGES as readonly PathKind[]).includes(pathKind);
}

/** The exact shape persisted to `insights_traffic_daily/{date}` (minus `updatedAt`). */
export interface TrafficDailyAggregate {
  date: string;
  totalViews: number;
  uniqueSessions: number;
  /** VIEW counts per path kind (an 8-view session counts 8 here). */
  byPathKind: Record<PathKind, number>;
  /** VIEW counts per source. */
  bySource: Record<Source, number>;
  /** DISTINCT-SESSION counts per funnel stage — a session that viewed 8
   *  detail pages still counts once here, not 8 times. */
  funnel: Record<FunnelStage, number>;
}

export interface AggregateTrafficResult extends TrafficDailyAggregate {
  /** Raw `page_views` docs deleted by this run. */
  deletedCount: number;
  /**
   * True when this run found an aggregate already written by an earlier run
   * for this date. Covers both the normal idempotent re-run (nothing left to
   * do) and recovery from an earlier run that crashed after writing the
   * aggregate but before finishing its deletes — either way, the numbers
   * above are NOT recomputed, only leftover raw docs (if any) get cleaned up.
   */
  alreadyAggregated: boolean;
}

export interface AggregateTrafficOptions {
  /** Page size for the read pass. Default 500. Injectable so tests can
   *  exercise the multi-page loop without seeding hundreds of documents. */
  pageSize?: number;
  /** Batch size for the delete pass. Firestore's WriteBatch hard cap is 500
   *  ops — default matches that. Injectable for the same reason as pageSize. */
  deleteBatchSize?: number;
}

const DEFAULT_PAGE_SIZE = 500;
const DEFAULT_DELETE_BATCH_SIZE = 500; // Firestore WriteBatch hard limit (see dailyUnsoldDigest.ts).

// ---------------------------------------------------------------------------
// Delete helpers
// ---------------------------------------------------------------------------

/** Deletes `refs` in batches of `batchSize` (<= Firestore's 500-op cap). */
async function deleteByRefs(
  db: FirebaseFirestore.Firestore,
  refs: FirebaseFirestore.DocumentReference[],
  batchSize: number,
): Promise<number> {
  for (let i = 0; i < refs.length; i += batchSize) {
    const batch = db.batch();
    for (const ref of refs.slice(i, i + batchSize)) batch.delete(ref);
    await batch.commit();
  }
  return refs.length;
}

/**
 * Cleanup-only pass: queries `page_views` still standing in `[startMs, endMs)`
 * and deletes them, one page at a time, without aggregating anything. Used
 * only when an aggregate already exists for the date (see `alreadyAggregated`
 * above) — the numbers are already durable, so this just finishes discarding
 * the raw events that were already counted into them.
 */
async function deleteRemainingRawEvents(
  db: FirebaseFirestore.Firestore,
  startMs: number,
  endMs: number,
  pageSize: number,
): Promise<number> {
  const col = db.collection('page_views');
  let deleted = 0;
  for (;;) {
    const snap = await col
      .where('at', '>=', Timestamp.fromMillis(startMs))
      .where('at', '<', Timestamp.fromMillis(endMs))
      .orderBy('at', 'asc')
      .limit(pageSize)
      .get();
    if (snap.empty) break;
    deleted += await deleteByRefs(
      db,
      snap.docs.map((d) => d.ref),
      pageSize,
    );
    if (snap.size < pageSize) break;
  }
  return deleted;
}

// ---------------------------------------------------------------------------
// Main aggregation
// ---------------------------------------------------------------------------

/**
 * Rolls yesterday's (Paraguay-local) `page_views` into one document at
 * `insights_traffic_daily/{date}`, then deletes the raw events it aggregated.
 * Never touches today's events — the range queried is a half-open Paraguay
 * calendar day strictly before "now".
 *
 * Idempotency: the aggregate is written to Firestore BEFORE any raw doc is
 * deleted, and only after every page of the day has been read and folded
 * into the in-memory counters. If this run finds `insights_traffic_daily/
 * {date}` already present, it does NOT recompute — the durable numbers from
 * whichever run wrote them are the ones that survive by design, and this run
 * only finishes deleting any raw docs still left in range (self-healing for
 * a prior run that crashed between the two steps; a harmless no-op
 * otherwise, since a completed prior run already deleted everything).
 *
 * Write-then-delete is the fail-safe order, not the reverse: a crash after
 * the aggregate write but before (or mid-way through) the deletes leaves the
 * correct numbers durably in place, with only some now-redundant raw docs
 * left to clean up later — no data lost, nothing to recompute. Deleting
 * first would risk the opposite: a crash after deleting some raw docs but
 * before ever writing the aggregate destroys their contribution permanently,
 * with no durable copy anywhere to recover it from.
 *
 * Volume: paginates the read (`pageSize`, default 500) instead of loading a
 * day of documents into one array — only a handful of running counters and a
 * list of `DocumentReference`s (needed to delete precisely what was
 * aggregated) accumulate across pages, never the documents' field data
 * itself. Deletes commit in batches of `deleteBatchSize` (default 500),
 * Firestore's hard cap per `WriteBatch`.
 */
export async function runAggregateTraffic(
  nowMs: number = Date.now(),
  options: AggregateTrafficOptions = {},
): Promise<AggregateTrafficResult> {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const deleteBatchSize = options.deleteBatchSize ?? DEFAULT_DELETE_BATCH_SIZE;

  const db = adminDb();
  const date = yesterdayDateKey(nowMs);
  const { startMs, endMs } = paraguayDayRangeMs(date);
  const aggRef = db.doc(`insights_traffic_daily/${date}`);

  const existing = await aggRef.get();
  if (existing.exists) {
    const deletedCount = await deleteRemainingRawEvents(db, startMs, endMs, pageSize);
    const data = existing.data() as TrafficDailyAggregate;
    return {
      date,
      totalViews: data.totalViews,
      uniqueSessions: data.uniqueSessions,
      byPathKind: data.byPathKind,
      bySource: data.bySource,
      funnel: data.funnel,
      deletedCount,
      alreadyAggregated: true,
    };
  }

  // ---- Pass 1: paginate the raw docs for `date`, folding each one into
  // running counters immediately. Only the counters and a list of doc refs
  // (for the delete pass below) survive across pages — never a page's field
  // data once it's been folded in. ----
  let totalViews = 0;
  const sessions = new Set<string>();
  const byPathKind = zeroRecord(PATH_KINDS);
  const bySource = zeroRecord(SOURCES);
  const funnelSessions: Record<FunnelStage, Set<string>> = {
    home: new Set(),
    catalog: new Set(),
    detail: new Set(),
    login: new Set(),
  };
  const refsToDelete: FirebaseFirestore.DocumentReference[] = [];

  const col = db.collection('page_views');
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    let q = col
      .where('at', '>=', Timestamp.fromMillis(startMs))
      .where('at', '<', Timestamp.fromMillis(endMs))
      .orderBy('at', 'asc')
      .limit(pageSize);
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      const data = doc.data();
      const pathKind = data['pathKind'] as PathKind;
      const source = data['source'] as Source;
      const sessionId = data['sessionId'] as string;

      totalViews += 1;
      sessions.add(sessionId);
      byPathKind[pathKind] = (byPathKind[pathKind] ?? 0) + 1;
      bySource[source] = (bySource[source] ?? 0) + 1;
      if (isFunnelStage(pathKind)) {
        funnelSessions[pathKind].add(sessionId);
      }
      refsToDelete.push(doc.ref);
    }

    if (snap.size < pageSize) break;
    cursor = snap.docs[snap.docs.length - 1];
  }

  const funnel = zeroRecord(FUNNEL_STAGES);
  for (const stage of FUNNEL_STAGES) {
    funnel[stage] = funnelSessions[stage].size;
  }

  const aggregate: TrafficDailyAggregate = {
    date,
    totalViews,
    uniqueSessions: sessions.size,
    byPathKind,
    bySource,
    funnel,
  };

  // Durable write BEFORE the destructive delete — see the fail-safe-order
  // explanation in this function's doc comment.
  await aggRef.set({ ...aggregate, updatedAt: FieldValue.serverTimestamp() });

  const deletedCount = await deleteByRefs(db, refsToDelete, deleteBatchSize);

  return { ...aggregate, deletedCount, alreadyAggregated: false };
}

export const aggregateTraffic = onSchedule(
  {
    // dailyUnsoldDigest runs at 09:00 America/Asuncion (dailyUnsoldDigest.ts).
    // This runs 30 minutes later, same timezone, same daily cadence — late
    // enough that "yesterday" (Paraguay-local) is unambiguously closed for
    // every visitor's clock by the time this fires, and offset enough from
    // 09:00 that the two scheduled functions never share a trigger minute.
    // The two jobs touch disjoint collections (this one never reads/writes
    // vehicles/users/auctions), so there is no data dependency between them
    // — the stagger is purely to avoid two daily batch jobs firing at the
    // exact same instant, per this task's brief.
    schedule: '30 9 * * *',
    timeZone: 'America/Asuncion',
    region: 'us-central1',
  },
  async () => {
    const r = await runAggregateTraffic();
    console.log(
      `aggregateTraffic: date=${r.date} totalViews=${r.totalViews} uniqueSessions=${r.uniqueSessions} deleted=${r.deletedCount} alreadyAggregated=${r.alreadyAggregated}`,
    );
  },
);
