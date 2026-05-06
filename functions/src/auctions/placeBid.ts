import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { adminDb } from '../lib/admin.js';
import { requireSignedIn } from '../lib/errors.js';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

// Hard ceiling for any single bid amount, in USD. Above this, the platform
// stops being a vehicle auction and starts being a typo / DoS vector. Can be
// overridden per-deployment via app_config.bid.maxBidUsd.
const DEFAULT_MAX_BID_USD = 200_000;

const InputSchema = z.object({
  auctionId: z.string().min(1),
  amount: z
    .number()
    .positive()
    .finite()
    .max(DEFAULT_MAX_BID_USD * 10),
});

const RATE_LIMIT_MAX = 10; // bids per minute per buyer
const RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_ANTI_SNIPING_SECONDS = 60;

export interface PlaceBidResult {
  bidId: string;
  newCurrentBid: number;
  endsAtMs: number; // possibly extended by anti-sniping
}

export async function placeBidHandler(req: CallableRequest): Promise<PlaceBidResult> {
  const { uid, role } = requireSignedIn(req);
  if (role !== 'buyer' && role !== 'admin') {
    throw new HttpsError('permission-denied', 'Only buyers can place bids');
  }
  const parsed = InputSchema.safeParse(req.data);
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Invalid input', parsed.error.flatten());
  }
  const { auctionId, amount } = parsed.data;

  const db = adminDb();

  // ---- Rate limit (outside transaction) ----
  const rlRef = db.doc(`rate_limits/bids_${uid}`);
  const rlSnap = await rlRef.get();
  const now = Date.now();
  const recent = ((rlSnap.data()?.['timestamps'] as number[] | undefined) ?? []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS,
  );
  if (recent.length >= RATE_LIMIT_MAX) {
    throw new HttpsError('resource-exhausted', 'Bid rate limit exceeded (10/min)');
  }

  // ---- Anti-sniping config + max-bid cap (outside transaction; cached doc) ----
  const cfgSnap = await db.doc('app_config/global').get();
  const bidCfg = (cfgSnap.data()?.['bid'] ?? {}) as Record<string, unknown>;
  const antiSnipingSeconds =
    (bidCfg['antiSnipingSeconds'] as number | undefined) ?? DEFAULT_ANTI_SNIPING_SECONDS;
  const maxBidUsd =
    typeof bidCfg['maxBidUsd'] === 'number' && bidCfg['maxBidUsd']! > 0
      ? (bidCfg['maxBidUsd'] as number)
      : DEFAULT_MAX_BID_USD;

  // Reject absurd amounts before touching the transaction. The schema already
  // rejects truly insane values, but a configurable cap means each deployment
  // can tighten or loosen as the inventory range changes.
  if (amount > maxBidUsd) {
    throw new HttpsError(
      'invalid-argument',
      `Bid exceeds the maximum allowed (USD ${maxBidUsd.toLocaleString()}).`,
    );
  }

  const auctionRef = db.doc(`auctions/${auctionId}`);

  // ---- Buyer profile snapshot (for buyerSnapshot field) ----
  const userSnap = await db.doc(`users/${uid}`).get();
  const profile = (userSnap.data()?.['profile'] ?? {}) as Record<string, unknown>;
  const buyerSnapshot = {
    firstName: (profile['firstName'] as string) ?? '',
    lastInitial: ((profile['lastName'] as string) ?? '').charAt(0).toUpperCase() || '?',
  };

  const result = await db.runTransaction(async (tx) => {
    const aSnap = await tx.get(auctionRef);
    if (!aSnap.exists) throw new HttpsError('not-found', 'Auction not found');
    const a = aSnap.data()!;

    if (a['status'] !== 'live') {
      throw new HttpsError('failed-precondition', `Auction is ${a['status']}, not live`);
    }
    const endsAt = a['endsAt'] as Timestamp;
    if (endsAt.toMillis() <= now) {
      throw new HttpsError('failed-precondition', 'Auction has ended');
    }
    // Self-outbid is intentionally allowed: a buyer who is already winning can
    // raise their own bid above the current top to defend it preemptively or
    // to register a higher proxy ceiling. The minRequired check below still
    // enforces a strictly increasing bid amount.

    const currentBid = (a['currentBid'] as number) ?? 0;
    const startingPrice = (a['startingPrice'] as number) ?? 0;
    const bidIncrement = (a['bidIncrement'] as number) ?? 0;
    const minRequired = currentBid > 0 ? currentBid + bidIncrement : startingPrice;
    if (amount < minRequired) {
      throw new HttpsError('failed-precondition', `Bid must be at least ${minRequired}`);
    }

    // Anti-sniping: extend endsAt if within window
    const remainingMs = endsAt.toMillis() - now;
    let nextEndsAt = endsAt;
    if (remainingMs < antiSnipingSeconds * 1000) {
      nextEndsAt = Timestamp.fromMillis(now + antiSnipingSeconds * 1000);
    }

    // Mark previous winning bid as outbid
    if (a['currentBidderUid']) {
      const prevQ = await tx.get(
        auctionRef.collection('bids').where('status', '==', 'winning').limit(1),
      );
      prevQ.forEach((doc) => tx.update(doc.ref, { status: 'outbid' }));
    }

    const bidRef = auctionRef.collection('bids').doc();
    tx.set(bidRef, {
      id: bidRef.id,
      auctionId,
      buyerUid: uid,
      buyerSnapshot,
      amount,
      createdAt: FieldValue.serverTimestamp(),
      status: 'winning',
    });

    tx.update(auctionRef, {
      currentBid: amount,
      currentBidderUid: uid,
      bidCount: FieldValue.increment(1),
      endsAt: nextEndsAt,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { bidId: bidRef.id, newCurrentBid: amount, endsAtMs: nextEndsAt.toMillis() };
  });

  // ---- Update rate limit doc (outside transaction) ----
  await rlRef.set({ timestamps: [...recent, now] }, { merge: true });

  return result;
}

export const placeBid = onCall(
  { region: 'us-central1', enforceAppCheck: process.env['ENFORCE_APP_CHECK'] === 'true' },
  placeBidHandler,
);
