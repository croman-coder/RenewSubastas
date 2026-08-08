import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { adminDb } from '../lib/admin.js';
import { writeAuditLog } from '../lib/audit.js';
import { requireSignedIn } from '../lib/errors.js';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

const MAX_PRICE_USD = 200_000;
const MAX_INCREMENT_USD = 50_000;

// Keep in sync with the same constant in createAuction.ts. See the
// hardEndsAt comment in packages/shared-types/src/auction.ts.
const MAX_TOTAL_EXTENSION_MS = 30 * 60_000;

const InputSchema = z.object({
  auctionId: z.string().min(1),
  startingPrice: z.number().positive().finite().max(MAX_PRICE_USD).optional(),
  reservePrice: z.number().positive().finite().max(MAX_PRICE_USD).nullable().optional(),
  buyNowPrice: z.number().positive().finite().max(MAX_PRICE_USD).nullable().optional(),
  bidIncrement: z.number().positive().finite().max(MAX_INCREMENT_USD).optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
});

export interface UpdateAuctionResult {
  ok: true;
}

interface PriceChangeRecord {
  field: 'startingPrice' | 'reservePrice';
  from: number | null;
  to: number | null;
  isReduction: boolean;
}

interface TxResult {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  priceChanges: PriceChangeRecord[];
}

/**
 * Edits an auction. Admin or staff only.
 *
 * Edit rules depend on auction status to protect bidders:
 *   - scheduled  → everything editable (no one has bid yet): prices,
 *                  increment, both dates.
 *   - live       → only `endsAt` may change, and only to EXTEND (never
 *                  shorten — pulling time away from active bidders is
 *                  unfair). Prices/increment are frozen once bidding
 *                  is open.
 *   - ended /
 *     cancelled  → immutable. No edits.
 *
 * The read of "current status", every validation against current values,
 * and the write all happen inside ONE transaction. This used to be a plain
 * `ref.get()` followed by a separate `ref.update()` — a full round-trip
 * apart from the write — so `tickAuctions` (which promotes scheduled→live
 * every minute) could flip the status in between, landing a "scheduled"
 * edit (e.g. a price change) onto an auction that by the time of the write
 * already has bidders on it.
 *
 * reservePrice never lives on this doc — see AuctionPrivateSchema. It's
 * read from and written to auctions/{id}/private/internal, which buyers
 * cannot read.
 *
 * Every edit is audit-logged with before/after so changes to a live
 * auction's clock are traceable.
 */
export async function updateAuctionHandler(req: CallableRequest): Promise<UpdateAuctionResult> {
  const { uid: actorUid, role } = requireSignedIn(req);
  if (role !== 'staff' && role !== 'admin') {
    throw new HttpsError('permission-denied', 'Only staff or admin can edit auctions');
  }
  const parsed = InputSchema.safeParse(req.data);
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Invalid input', parsed.error.flatten());
  }
  const v = parsed.data;

  const db = adminDb();
  const ref = db.doc(`auctions/${v.auctionId}`);
  const privateRef = ref.collection('private').doc('internal');

  const { before, after, priceChanges } = await db.runTransaction<TxResult>(async (tx) => {
    // ---- All reads first (Firestore requires this before any write) ----
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Auction not found');
    const a = snap.data()!;
    const status = a['status'] as string;

    if (status === 'ended' || status === 'cancelled') {
      throw new HttpsError('failed-precondition', `Cannot edit an auction in status "${status}"`);
    }

    // Only fetch the private doc when we might actually need the current
    // reserve: the caller is touching reservePrice, or buyNowPrice (which
    // must be validated against the reserve below), or we're in the
    // `scheduled` branch where the reserve>=startingPrice check needs it.
    const needsReserveRead =
      v.reservePrice !== undefined || v.buyNowPrice !== undefined || status === 'scheduled';
    const privateSnap = needsReserveRead ? await tx.get(privateRef) : null;
    const currentReserve = privateSnap?.data()?.['reservePrice'] as number | undefined;

    // ---- Branch + validate (still no writes) ----
    const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    const priceChanges: PriceChangeRecord[] = [];
    let reserveWrite: number | null | undefined; // undefined = no change requested

    if (status === 'scheduled') {
      // Full edit allowed.
      if (v.startingPrice !== undefined) {
        update['startingPrice'] = v.startingPrice;
        before['startingPrice'] = a['startingPrice'];
        after['startingPrice'] = v.startingPrice;
        if (v.startingPrice !== a['startingPrice']) {
          const from = (a['startingPrice'] as number | undefined) ?? null;
          priceChanges.push({
            field: 'startingPrice',
            from,
            to: v.startingPrice,
            isReduction: typeof from === 'number' && v.startingPrice < from,
          });
        }
      }
      if (v.reservePrice !== undefined) {
        after['reservePrice'] = v.reservePrice;
        reserveWrite = v.reservePrice; // number, or null to clear
        if (v.reservePrice !== (currentReserve ?? null)) {
          const from = currentReserve ?? null;
          const to = v.reservePrice; // number | null
          priceChanges.push({
            field: 'reservePrice',
            from,
            to,
            isReduction: typeof from === 'number' && typeof to === 'number' && to < from,
          });
        }
      }
      if (v.bidIncrement !== undefined) {
        update['bidIncrement'] = v.bidIncrement;
        before['bidIncrement'] = a['bidIncrement'];
        after['bidIncrement'] = v.bidIncrement;
      }
      if (v.startsAt !== undefined) {
        update['startsAt'] = Timestamp.fromDate(new Date(v.startsAt));
        after['startsAt'] = v.startsAt;
      }
      if (v.endsAt !== undefined) {
        update['endsAt'] = Timestamp.fromDate(new Date(v.endsAt));
        after['endsAt'] = v.endsAt;
      }

      // Validate the resulting window + reserve relationship.
      const finalStart = v.startsAt
        ? new Date(v.startsAt).getTime()
        : (a['startsAt'] as Timestamp).toMillis();
      const finalEnd = v.endsAt
        ? new Date(v.endsAt).getTime()
        : (a['endsAt'] as Timestamp).toMillis();
      if (finalEnd <= finalStart + 60_000) {
        throw new HttpsError('invalid-argument', 'endsAt must be at least 1 minute after startsAt');
      }
      const finalStartPrice = v.startingPrice ?? (a['startingPrice'] as number);
      const finalReserve = v.reservePrice === null ? undefined : (v.reservePrice ?? currentReserve);
      if (finalReserve !== undefined && finalReserve < finalStartPrice) {
        throw new HttpsError('invalid-argument', 'reservePrice must be >= startingPrice');
      }

      // Nothing has bid yet in `scheduled` — a full reschedule earns a
      // fresh anti-sniping runway measured from wherever the new end
      // time lands (no bidder time is being taken away; there's no
      // bidder yet).
      if (v.startsAt !== undefined || v.endsAt !== undefined) {
        update['hardEndsAt'] = Timestamp.fromMillis(finalEnd + MAX_TOTAL_EXTENSION_MS);
      }
    } else if (status === 'live') {
      // Live: only extend endsAt. Reject any price/increment/start edit.
      if (
        v.startingPrice !== undefined ||
        v.bidIncrement !== undefined ||
        v.reservePrice !== undefined ||
        v.startsAt !== undefined
      ) {
        throw new HttpsError(
          'failed-precondition',
          'A live auction can only have its end time extended; prices are frozen once bidding is open',
        );
      }
      if (v.endsAt === undefined) {
        throw new HttpsError('invalid-argument', 'Provide a new endsAt to extend the auction');
      }
      const currentEnd = (a['endsAt'] as Timestamp).toMillis();
      const newEnd = new Date(v.endsAt).getTime();
      if (newEnd <= currentEnd) {
        throw new HttpsError(
          'failed-precondition',
          'New end time must be later than the current one (extend only)',
        );
      }
      update['endsAt'] = Timestamp.fromDate(new Date(v.endsAt));
      before['endsAt'] = new Date(currentEnd).toISOString();
      after['endsAt'] = v.endsAt;
      // A manual staff extension always earns a fresh buyer-anti-sniping
      // runway from the new end time — otherwise the very next snipe bid
      // could find the auction already "at the cap" right after staff
      // just deliberately bought more time.
      update['hardEndsAt'] = Timestamp.fromMillis(newEnd + MAX_TOTAL_EXTENSION_MS);
    }

    // buyNowPrice validation is not gated to a specific status branch (unlike
    // the price fields above, which the `live` branch rejects outright). In
    // practice it's reachable in two cases: freely on `scheduled`, or on
    // `live` bundled with the mandatory endsAt extension — the `live` branch
    // above still requires endsAt on every call, buyNowPrice or not.
    if (v.buyNowPrice !== undefined && v.buyNowPrice !== null) {
      // Compare against the EFFECTIVE reserve after this edit: if staff
      // changes both reservePrice and buyNowPrice in one submit, validating
      // against the stale stored reserve would accept an inconsistent pair.
      const effectiveReserve =
        reserveWrite !== undefined && reserveWrite !== null ? reserveWrite : currentReserve;
      if (effectiveReserve !== undefined && v.buyNowPrice <= effectiveReserve) {
        throw new HttpsError(
          'invalid-argument',
          'El precio de Compra ya debe ser mayor al precio objetivo.',
        );
      }
      update['buyNowPrice'] = v.buyNowPrice;
    } else if (v.buyNowPrice === null) {
      update['buyNowPrice'] = FieldValue.delete();
    }

    if (
      Object.keys(update).length === 1 &&
      reserveWrite === undefined &&
      v.buyNowPrice === undefined
    ) {
      // Only updatedAt on the parent doc, no reservePrice change (lands on
      // the private doc, not `update`), and no buyNowPrice change either —
      // nothing actually changed.
      throw new HttpsError('invalid-argument', 'No editable fields provided');
    }

    // ---- Writes ----
    tx.update(ref, update);
    if (reserveWrite !== undefined) {
      if (reserveWrite === null) {
        tx.set(privateRef, { reservePrice: FieldValue.delete() }, { merge: true });
      } else {
        tx.set(privateRef, { reservePrice: reserveWrite }, { merge: true });
      }
    }

    return { before, after, priceChanges };
  });

  // ---- Price-change history (insights report) ----
  // Non-critical: a failure here must never turn the user's already-
  // committed edit into an error. Log and continue.
  if (priceChanges.length > 0) {
    try {
      const actorSnap = await db.doc(`users/${actorUid}`).get();
      const ap = (actorSnap.data()?.['profile'] ?? {}) as Record<string, unknown>;
      const actorName =
        [ap['firstName'], ap['lastName']].filter(Boolean).join(' ') ||
        ((actorSnap.data()?.['email'] as string) ?? actorUid);
      const batch = db.batch();
      for (const change of priceChanges) {
        batch.set(ref.collection('priceChanges').doc(), {
          ...change,
          actorUid,
          actorName,
          at: FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
    } catch (err) {
      console.error('[updateAuction] priceChanges write failed', err);
    }
  }

  await writeAuditLog({
    actorUid,
    action: 'auction.update',
    resourceType: 'auction',
    resourceId: v.auctionId,
    before,
    after,
  });

  return { ok: true };
}

export const updateAuction = onCall(
  { region: 'us-central1', enforceAppCheck: process.env['ENFORCE_APP_CHECK'] !== 'false' },
  updateAuctionHandler,
);
