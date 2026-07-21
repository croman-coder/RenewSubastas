import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '../lib/admin.js';
import { requireSignedIn } from '../lib/errors.js';

const InputSchema = z.object({ auctionId: z.string().min(1).max(64) });

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;

export interface LogAuctionViewResult {
  ok: true;
  /** false when the caller is internal staff (views intentionally not recorded). */
  logged: boolean;
}

/**
 * Records a buyer's visit to an auction detail page.
 *
 * - Buyers only: admin/staff/finanzas views are a no-op — the report is about
 *   real demand, not internal browsing.
 * - Aggregates live on the auction doc (`viewStats.total/unique`) so the list
 *   report never has to fan out over subcollections.
 * - Server-side rate limit (20/min per user) so a hostile client can't inflate
 *   counters; the well-behaved client additionally throttles via sessionStorage.
 */
export async function logAuctionViewHandler(req: CallableRequest): Promise<LogAuctionViewResult> {
  const { uid, role } = requireSignedIn(req);
  if (role !== 'buyer') {
    return { ok: true, logged: false };
  }
  const parsed = InputSchema.safeParse(req.data);
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Invalid input', parsed.error.flatten());
  }
  const { auctionId } = parsed.data;

  const db = adminDb();
  const auctionRef = db.doc(`auctions/${auctionId}`);
  const viewerRef = auctionRef.collection('viewers').doc(uid);
  const rlRef = db.doc(`rate_limits/views_${uid}`);
  const userSnap = await db.doc(`users/${uid}`).get();
  const profile = (userSnap.data()?.['profile'] ?? {}) as Record<string, unknown>;
  const firstName = (profile['firstName'] as string) ?? '';
  const lastInitial = ((profile['lastName'] as string) ?? '').charAt(0).toUpperCase() || '?';

  await db.runTransaction(async (tx) => {
    const now = Date.now();

    // Rate limit inside the transaction (same pattern as placeBid).
    const rlSnap = await tx.get(rlRef);
    const recent = ((rlSnap.data()?.['timestamps'] as number[] | undefined) ?? []).filter(
      (t) => now - t < RATE_LIMIT_WINDOW_MS,
    );
    if (recent.length >= RATE_LIMIT_MAX) {
      throw new HttpsError('resource-exhausted', 'View rate limit exceeded');
    }

    const aSnap = await tx.get(auctionRef);
    if (!aSnap.exists) throw new HttpsError('not-found', 'Auction not found');

    const vSnap = await tx.get(viewerRef);
    const isNewViewer = !vSnap.exists;

    tx.set(rlRef, { timestamps: [...recent, now] });

    if (isNewViewer) {
      tx.set(viewerRef, {
        uid,
        firstName,
        lastInitial,
        firstViewAt: FieldValue.serverTimestamp(),
        lastViewAt: FieldValue.serverTimestamp(),
        viewCount: 1,
      });
    } else {
      tx.update(viewerRef, {
        lastViewAt: FieldValue.serverTimestamp(),
        viewCount: FieldValue.increment(1),
      });
    }

    tx.update(auctionRef, {
      'viewStats.total': FieldValue.increment(1),
      ...(isNewViewer ? { 'viewStats.unique': FieldValue.increment(1) } : {}),
    });
  });

  return { ok: true, logged: true };
}

export const logAuctionView = onCall(
  { region: 'us-central1', enforceAppCheck: process.env['ENFORCE_APP_CHECK'] === 'true' },
  logAuctionViewHandler,
);
