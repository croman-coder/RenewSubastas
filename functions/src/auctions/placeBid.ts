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
    .max(DEFAULT_MAX_BID_USD * 10)
    // Money is denominated in USD with at most cents-precision. Anything
    // finer is either a typo, a bug, or a float-precision artifact from a
    // previous broken bid leaking into the next minRequired. Use the
    // `* 100 -> round -> compare` trick so we don't fight float epsilons.
    .refine((v) => Math.abs(Math.round(v * 100) - v * 100) < 1e-6, {
      message: 'amount must have at most 2 decimal places',
    }),
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
  // Only buyers may bid. Admins and staff are deliberately excluded — even
  // though admins have the highest trust level elsewhere in the app, letting
  // an admin place bids opens the door to shill-bidding (an operator pushing
  // a price up against a real buyer). The marketplace's integrity depends
  // on the bidding side being strictly held to genuine customer accounts.
  if (role !== 'buyer') {
    throw new HttpsError('permission-denied', 'Only buyers can place bids');
  }
  const parsed = InputSchema.safeParse(req.data);
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Invalid input', parsed.error.flatten());
  }
  const { auctionId } = parsed.data;
  // Snap to cents so stored values are always clean (no 16002.55555555 from
  // a stray float). Schema already validated 2-decimal precision so this is
  // a normalization, not a silent rounding.
  const amount = Math.round(parsed.data.amount * 100) / 100;

  const db = adminDb();
  const rlRef = db.doc(`rate_limits/bids_${uid}`);

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

  // Buyers self-registered via Google enter without a document. Money can't
  // move without one, so the bid is blocked until the profile is completed
  // at /settings/profile. Enforced here (server-authoritative), surfaced in
  // the client as a friendly toast with a link.
  if (!profile['documentType'] || !profile['documentNumber']) {
    throw new HttpsError('failed-precondition', 'profile_incomplete');
  }

  const result = await db.runTransaction(async (tx) => {
    // Capture the clock inside the transaction so each optimistic retry
    // re-reads it — keeps the "ended" check and the anti-sniping extension
    // consistent with the attempt that actually commits (not a stale value
    // from before contention forced a retry).
    const now = Date.now();

    // ---- Rate limit (inside the transaction) ----
    // Read-check-write must be atomic: doing it outside the transaction let
    // concurrent bids all read the same sub-limit array, pass the check, and
    // clobber each other's append — effectively no limit under a burst. The
    // rlRef read here joins the transaction's read set, so Firestore's
    // optimistic concurrency serializes rapid bids from the same buyer.
    const rlSnap = await tx.get(rlRef);
    const recent = ((rlSnap.data()?.['timestamps'] as number[] | undefined) ?? []).filter(
      (t) => now - t < RATE_LIMIT_WINDOW_MS,
    );
    if (recent.length >= RATE_LIMIT_MAX) {
      throw new HttpsError('resource-exhausted', 'Bid rate limit exceeded (10/min)');
    }

    const aSnap = await tx.get(auctionRef);
    if (!aSnap.exists) throw new HttpsError('not-found', 'Auction not found');
    const a = aSnap.data()!;

    if (a['status'] !== 'live') {
      throw new HttpsError('failed-precondition', `Auction is ${a['status']}, not live`);
    }
    // Audience gate: a retail buyer cannot bid on a wholesale auction and
    // vice-versa. Admins are allowed through (cross-audience review). Legacy
    // auctions without audience default to retail to preserve old behavior.
    const auctionAudience = (a['audience'] as 'retail' | 'wholesale' | undefined) ?? 'retail';
    if (role === 'buyer') {
      const buyerAudience =
        (req.auth?.token['audience'] as 'retail' | 'wholesale' | undefined) ?? 'retail';
      if (buyerAudience !== auctionAudience) {
        throw new HttpsError(
          'permission-denied',
          'Esta subasta no está disponible para tu cuenta.',
        );
      }
    }
    const endsAt = a['endsAt'] as Timestamp;
    if (endsAt.toMillis() <= now) {
      throw new HttpsError('failed-precondition', 'Auction has ended');
    }
    // Self-outbid is forbidden: a buyer who is already the highest bidder
    // cannot bid again. Raising your own winning bid only inflates the price
    // you'll pay with no benefit, and it muddies the outbid-notification
    // logic. The UI also hides the bid action while you're winning; this is
    // the server-side enforcement of the same rule.
    if (a['currentBidderUid'] === uid) {
      throw new HttpsError('failed-precondition', 'Ya sos el mejor postor de esta subasta.');
    }

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

    // The bidder we're displacing (the prior top bidder). Recorded on the
    // new bid doc so sendBidOutbid can email exactly the right person instead
    // of querying bid history by timestamp (which is racy and needs an index).
    const displacedBuyerUid = (a['currentBidderUid'] as string | undefined) ?? null;

    // Mark previous winning bid as outbid
    if (displacedBuyerUid) {
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
      displacedBuyerUid,
      // Prior top bid amount, so the outbid email can show the displaced
      // bidder their own previous figure without an extra query.
      displacedAmount: displacedBuyerUid ? currentBid : null,
    });

    tx.update(auctionRef, {
      currentBid: amount,
      currentBidderUid: uid,
      bidCount: FieldValue.increment(1),
      endsAt: nextEndsAt,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Record this bid's timestamp in the rate-limit window (atomic with the
    // bid itself).
    tx.set(rlRef, { timestamps: [...recent, now] });

    return { bidId: bidRef.id, newCurrentBid: amount, endsAtMs: nextEndsAt.toMillis() };
  });

  return result;
}

export const placeBid = onCall(
  { region: 'us-central1', enforceAppCheck: process.env['ENFORCE_APP_CHECK'] === 'true' },
  placeBidHandler,
);
