import 'server-only';
import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore } from 'firebase-admin/firestore';
import { batchClock, type BatchClock } from './batch';

/** Safety cap: a batch is tens of units, not thousands. */
const SCAN_LIMIT = 500;

const ms = (v: unknown): number =>
  (v as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;

/**
 * Batch clock for operator dashboards, across BOTH audiences — admin and
 * staff run the whole floor, so scoping this to one segment would hide a
 * lote that is about to close.
 *
 * Queries live and scheduled separately with equality-only filters,
 * deliberately: adding `orderBy('endsAt')` alongside `where('status','==')`
 * would need a new composite index for a value we can derive from a small
 * result set. Scheduled is only fetched when nothing is live, so the common
 * case stays one read.
 *
 * Returns null when there is neither a running nor a queued lote.
 */
export async function loadBatchClock(): Promise<BatchClock | null> {
  const db = getFirestore(getAdminApp());

  const liveSnap = await db
    .collection('auctions')
    .where('status', '==', 'live')
    .limit(SCAN_LIMIT)
    .get();

  const live = liveSnap.docs.map((d) => ({
    status: 'live',
    startsAtMs: ms(d.data()['startsAt']),
    endsAtMs: ms(d.data()['endsAt']),
  }));
  const running = batchClock(live);
  if (running) return running;

  const scheduledSnap = await db
    .collection('auctions')
    .where('status', '==', 'scheduled')
    .limit(SCAN_LIMIT)
    .get();

  return batchClock(
    scheduledSnap.docs.map((d) => ({
      status: 'scheduled',
      startsAtMs: ms(d.data()['startsAt']),
      endsAtMs: ms(d.data()['endsAt']),
    })),
  );
}
