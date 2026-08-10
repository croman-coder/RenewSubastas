import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '../lib/admin.js';
import {
  runAggregateTraffic,
  paraguayDateKey,
  yesterdayDateKey,
  paraguayDayRangeMs,
} from './aggregateTraffic.js';

// Fixed "now" so every test's Paraguay-local day boundaries are deterministic
// regardless of when the suite actually runs. 2026-08-10T12:00:00Z = Paraguay
// 09:00 local (UTC-3) — mid-morning, matching the actual scheduled run time
// (09:30 America/Asuncion, see aggregateTraffic.ts), and nowhere near a
// midnight boundary so nothing here is accidentally timing-sensitive.
const NOW = Date.UTC(2026, 7, 10, 12, 0, 0);
const YESTERDAY = '2026-08-09';
const TODAY = '2026-08-10';

/** UTC ms for HH:mm(:ss via extra ms) local Paraguay time on `dateStr` (YYYY-MM-DD). */
function paraguayInstant(dateStr: string, hh: number, mm: number): number {
  const parts = dateStr.split('-').map(Number);
  const y = parts[0]!;
  const m = parts[1]!;
  const d = parts[2]!;
  return Date.UTC(y, m - 1, d, hh + 3, mm, 0); // Paraguay is UTC-3: UTC = local + 3h
}

async function clearAll() {
  for (const c of ['page_views', 'insights_traffic_daily']) {
    const docs = await adminDb().collection(c).listDocuments();
    await Promise.all(docs.map((d) => d.delete()));
  }
}

async function seedView(opts: {
  sessionId: string;
  pathKind: string;
  source: string;
  atMs: number;
  auctionId?: string;
}) {
  await adminDb()
    .collection('page_views')
    .add({
      pathKind: opts.pathKind,
      source: opts.source,
      sessionId: opts.sessionId,
      ...(opts.auctionId ? { auctionId: opts.auctionId } : {}),
      at: Timestamp.fromMillis(opts.atMs),
    });
}

async function allPageViews() {
  const snap = await adminDb().collection('page_views').get();
  return snap.docs.map((d) => d.data());
}

describe('paraguayDateKey / yesterdayDateKey / paraguayDayRangeMs (pure boundary math)', () => {
  it('paraguayDateKey converts a UTC instant to the correct Paraguay-local calendar date', () => {
    // 02:59:59 UTC on Aug 10 is still 23:59:59 local on Aug 9 (UTC-3).
    expect(paraguayDateKey(Date.UTC(2026, 7, 10, 2, 59, 59))).toBe('2026-08-09');
    // 03:00:00 UTC on Aug 10 is exactly 00:00:00 local on Aug 10.
    expect(paraguayDateKey(Date.UTC(2026, 7, 10, 3, 0, 0))).toBe('2026-08-10');
  });

  it('yesterdayDateKey is one Paraguay-local calendar day before `now`', () => {
    expect(yesterdayDateKey(Date.UTC(2026, 7, 10, 12, 0, 0))).toBe('2026-08-09');
    // Just after Paraguay midnight — "today" just rolled over to Aug 10.
    expect(yesterdayDateKey(Date.UTC(2026, 7, 10, 3, 0, 1))).toBe('2026-08-09');
    // One second before Paraguay midnight — "today" is still Aug 9 locally.
    expect(yesterdayDateKey(Date.UTC(2026, 7, 10, 2, 59, 59))).toBe('2026-08-08');
  });

  it('paraguayDayRangeMs returns a half-open [start, end) range, 24h wide, +3h off UTC midnight', () => {
    const { startMs, endMs } = paraguayDayRangeMs('2026-08-09');
    expect(startMs).toBe(Date.UTC(2026, 7, 9, 3, 0, 0));
    expect(endMs).toBe(Date.UTC(2026, 7, 10, 3, 0, 0));
    expect(endMs - startMs).toBe(24 * 3600_000);
  });
});

describe('runAggregateTraffic', () => {
  beforeEach(clearAll);

  it('aggregates totals and breakdowns, and the funnel counts sessions, not views', async () => {
    const A = 'session-a';
    const B = 'session-b';

    // Session A: 1 home view, then 8 detail views of DIFFERENT listings.
    await seedView({
      sessionId: A,
      pathKind: 'home',
      source: 'direct',
      atMs: paraguayInstant(YESTERDAY, 8, 0),
    });
    for (let i = 0; i < 8; i++) {
      await seedView({
        sessionId: A,
        pathKind: 'detail',
        source: 'ig',
        atMs: paraguayInstant(YESTERDAY, 8, i + 1),
        auctionId: `auction-${i}`,
      });
    }
    // Session B: a single home view, never opens a detail page.
    await seedView({
      sessionId: B,
      pathKind: 'home',
      source: 'direct',
      atMs: paraguayInstant(YESTERDAY, 9, 0),
    });

    const result = await runAggregateTraffic(NOW);

    expect(result.date).toBe(YESTERDAY);
    expect(result.totalViews).toBe(10); // 1 + 8 + 1
    expect(result.uniqueSessions).toBe(2);
    expect(result.byPathKind).toEqual({ home: 2, catalog: 0, detail: 8, login: 0, other: 0 });
    expect(result.bySource).toEqual({ ig: 8, fb: 0, google: 0, direct: 2, other: 0 });
    // The brief's exact scenario: one session's 8 detail VIEWS is still only
    // 1 in the funnel, because the funnel counts distinct sessions.
    expect(result.funnel).toEqual({ home: 2, catalog: 0, detail: 1, login: 0 });
    expect(result.alreadyAggregated).toBe(false);
    expect(result.deletedCount).toBe(10);

    // The persisted doc, not just the return value.
    const doc = await adminDb().doc(`insights_traffic_daily/${YESTERDAY}`).get();
    expect(doc.exists).toBe(true);
    const data = doc.data()!;
    expect(data['date']).toBe(YESTERDAY);
    expect(data['totalViews']).toBe(10);
    expect(data['funnel']).toEqual({ home: 2, catalog: 0, detail: 1, login: 0 });
    expect(data['updatedAt']).toBeInstanceOf(Timestamp);
  });

  it("deletes the aggregated day's raw events but leaves today's untouched", async () => {
    await seedView({
      sessionId: 's1',
      pathKind: 'home',
      source: 'direct',
      atMs: paraguayInstant(YESTERDAY, 10, 0),
    });
    await seedView({
      sessionId: 's2',
      pathKind: 'catalog',
      source: 'ig',
      atMs: paraguayInstant(TODAY, 1, 0),
    });

    await runAggregateTraffic(NOW);

    const remaining = await allPageViews();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!['sessionId']).toBe('s2'); // today's, untouched
    expect(remaining[0]!['pathKind']).toBe('catalog');
  });

  it('respects the Paraguay-local day boundary at second precision', async () => {
    // 23:59:59 local on YESTERDAY — must be aggregated and deleted.
    await seedView({
      sessionId: 'late',
      pathKind: 'home',
      source: 'direct',
      atMs: paraguayInstant(YESTERDAY, 23, 59) + 59_000,
    });
    // 00:00:01 local on TODAY — one second later, must NOT be touched.
    await seedView({
      sessionId: 'early',
      pathKind: 'home',
      source: 'direct',
      atMs: paraguayInstant(TODAY, 0, 0) + 1_000,
    });

    const result = await runAggregateTraffic(NOW);
    expect(result.totalViews).toBe(1);

    const remaining = await allPageViews();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!['sessionId']).toBe('early');
  });

  it('is idempotent — a second run over the same day changes nothing', async () => {
    await seedView({
      sessionId: 's1',
      pathKind: 'home',
      source: 'direct',
      atMs: paraguayInstant(YESTERDAY, 10, 0),
    });
    await seedView({
      sessionId: 's1',
      pathKind: 'detail',
      source: 'ig',
      atMs: paraguayInstant(YESTERDAY, 10, 5),
      auctionId: 'a1',
    });

    const first = await runAggregateTraffic(NOW);
    expect(first.alreadyAggregated).toBe(false);
    expect(first.totalViews).toBe(2);

    const second = await runAggregateTraffic(NOW);
    expect(second.alreadyAggregated).toBe(true);
    expect(second.totalViews).toBe(2); // not doubled, not zeroed
    expect(second.uniqueSessions).toBe(1);
    expect(second.deletedCount).toBe(0); // nothing left to delete

    const doc = await adminDb().doc(`insights_traffic_daily/${YESTERDAY}`).get();
    expect(doc.data()!['totalViews']).toBe(2); // still 2, never re-summed into 4
  });

  it('recovers from an interrupted run (aggregate written, deletes unfinished) without recomputing', async () => {
    // Simulate: a prior run computed and durably wrote the CORRECT aggregate,
    // then crashed before deleting the raw docs it read.
    await adminDb()
      .doc(`insights_traffic_daily/${YESTERDAY}`)
      .set({
        date: YESTERDAY,
        totalViews: 999, // deliberately NOT what the leftover raw doc below sums to
        uniqueSessions: 999,
        byPathKind: { home: 999, catalog: 0, detail: 0, login: 0, other: 0 },
        bySource: { ig: 0, fb: 0, google: 0, direct: 999, other: 0 },
        funnel: { home: 999, catalog: 0, detail: 0, login: 0 },
        updatedAt: FieldValue.serverTimestamp(),
      });
    // Orphaned raw doc left over from that interrupted run — must be
    // cleaned up, but must NOT be re-aggregated into (or replace) the
    // durable numbers already written above.
    await seedView({
      sessionId: 'orphan',
      pathKind: 'home',
      source: 'direct',
      atMs: paraguayInstant(YESTERDAY, 10, 0),
    });

    const result = await runAggregateTraffic(NOW);

    expect(result.alreadyAggregated).toBe(true);
    expect(result.totalViews).toBe(999); // proves it did NOT recompute from the leftover doc
    expect(result.deletedCount).toBe(1); // but the orphan still got cleaned up

    const remaining = await allPageViews();
    expect(remaining).toHaveLength(0);

    const doc = await adminDb().doc(`insights_traffic_daily/${YESTERDAY}`).get();
    expect(doc.data()!['totalViews']).toBe(999); // aggregate itself was never rewritten
  });

  it('threads deleteBatchSize (not pageSize) through the already-aggregated cleanup path', async () => {
    // Same "interrupted prior run" setup as above, but this time the point
    // is the delete-chunking, not the numbers: pageSize (query limit) is
    // deliberately LARGER than deleteBatchSize. If the cleanup path reused
    // pageSize as the delete-chunk size (the bug this guards against), 5
    // leftover docs would be deleted in exactly 1 batch; with
    // deleteBatchSize correctly threaded through, they must take 3
    // (ceil(5/2)). A batch() spy makes that observable directly instead of
    // only inferring it from a lack of a thrown over-cap error.
    await adminDb()
      .doc(`insights_traffic_daily/${YESTERDAY}`)
      .set({
        date: YESTERDAY,
        totalViews: 5,
        uniqueSessions: 5,
        byPathKind: { home: 5, catalog: 0, detail: 0, login: 0, other: 0 },
        bySource: { ig: 0, fb: 0, google: 0, direct: 5, other: 0 },
        funnel: { home: 5, catalog: 0, detail: 0, login: 0 },
        updatedAt: FieldValue.serverTimestamp(),
      });
    const leftoverIds = ['o1', 'o2', 'o3', 'o4', 'o5'];
    for (const id of leftoverIds) {
      await seedView({
        sessionId: id,
        pathKind: 'home',
        source: 'direct',
        atMs: paraguayInstant(YESTERDAY, 10, 0),
      });
    }

    const db = adminDb();
    const batchSpy = vi.spyOn(db, 'batch');

    const result = await runAggregateTraffic(NOW, { pageSize: 5, deleteBatchSize: 2 });

    expect(result.alreadyAggregated).toBe(true);
    expect(result.deletedCount).toBe(5);
    expect(batchSpy).toHaveBeenCalledTimes(3); // ceil(5/2), not 1 (ceil(5/5))

    const remaining = await allPageViews();
    expect(remaining).toHaveLength(0);

    batchSpy.mockRestore();
  });

  it('paginates the read and the delete across multiple pages instead of loading a whole day at once', async () => {
    const ids = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'];
    for (const id of ids) {
      await seedView({
        sessionId: id,
        pathKind: 'catalog',
        source: 'direct',
        atMs: paraguayInstant(YESTERDAY, 12, 0),
      });
    }

    // pageSize 3 over 7 docs forces 3 pages (3+3+1); deleteBatchSize 3 forces
    // 3 delete batches. Proves the loop doesn't skip/duplicate across a page
    // boundary without needing to seed hundreds of real documents.
    const result = await runAggregateTraffic(NOW, { pageSize: 3, deleteBatchSize: 3 });

    expect(result.totalViews).toBe(7);
    expect(result.uniqueSessions).toBe(7);
    expect(result.deletedCount).toBe(7);
    expect(result.byPathKind['catalog']).toBe(7);

    const remaining = await allPageViews();
    expect(remaining).toHaveLength(0);
  });

  it('writes an all-zero aggregate when yesterday had no traffic at all', async () => {
    const result = await runAggregateTraffic(NOW);
    expect(result.totalViews).toBe(0);
    expect(result.uniqueSessions).toBe(0);
    expect(result.byPathKind).toEqual({ home: 0, catalog: 0, detail: 0, login: 0, other: 0 });
    expect(result.funnel).toEqual({ home: 0, catalog: 0, detail: 0, login: 0 });

    const doc = await adminDb().doc(`insights_traffic_daily/${YESTERDAY}`).get();
    expect(doc.exists).toBe(true);
  });
});
