import 'server-only';
import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore } from 'firebase-admin/firestore';

/** Safety cap: a batch is tens of units, not thousands. */
const SCAN_LIMIT = 500;

/**
 * Closing time of the current batch for operator dashboards, across BOTH
 * audiences — admin and staff run the whole floor, so scoping this to one
 * segment would hide a lote that is about to close.
 *
 * Equality-only filter plus an in-memory min, deliberately: adding
 * `orderBy('endsAt')` alongside `where('status','==')` would require a new
 * composite index for a value we can derive from a small result set.
 *
 * Returns null when nothing is live so callers omit the clock rather than
 * render a frozen zero.
 */
export async function loadBatchEnd(): Promise<number | null> {
  const snap = await getFirestore(getAdminApp())
    .collection('auctions')
    .where('status', '==', 'live')
    .limit(SCAN_LIMIT)
    .get();

  let soonest: number | null = null;
  for (const d of snap.docs) {
    const ms = (d.data()['endsAt'] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
    if (ms > 0 && (soonest === null || ms < soonest)) soonest = ms;
  }
  return soonest;
}
