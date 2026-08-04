import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { adminDb } from '../lib/admin.js';
import { writeAuditLog } from '../lib/audit.js';
import { requireSignedIn } from '../lib/errors.js';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

const MAX_PRICE_USD = 200_000;
const MAX_INCREMENT_USD = 50_000;

const InputSchema = z.object({
  auctionId: z.string().min(1),
  startingPrice: z.number().positive().finite().max(MAX_PRICE_USD).optional(),
  reservePrice: z.number().positive().finite().max(MAX_PRICE_USD).nullable().optional(),
  bidIncrement: z.number().positive().finite().max(MAX_INCREMENT_USD).optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
});

export interface UpdateAuctionResult {
  ok: true;
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

  const ref = adminDb().doc(`auctions/${v.auctionId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Auction not found');
  const a = snap.data()!;
  const status = a['status'] as string;

  if (status === 'ended' || status === 'cancelled') {
    throw new HttpsError('failed-precondition', `Cannot edit an auction in status "${status}"`);
  }

  const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};

  if (status === 'scheduled') {
    // Full edit allowed.
    if (v.startingPrice !== undefined) {
      update['startingPrice'] = v.startingPrice;
      before['startingPrice'] = a['startingPrice'];
      after['startingPrice'] = v.startingPrice;
    }
    if (v.reservePrice !== undefined) {
      if (v.reservePrice === null) {
        update['reservePrice'] = FieldValue.delete();
      } else {
        update['reservePrice'] = v.reservePrice;
      }
      after['reservePrice'] = v.reservePrice;
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
    const finalReserve =
      v.reservePrice === null
        ? undefined
        : (v.reservePrice ?? (a['reservePrice'] as number | undefined));
    if (finalReserve !== undefined && finalReserve < finalStartPrice) {
      throw new HttpsError('invalid-argument', 'reservePrice must be >= startingPrice');
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
  }

  if (Object.keys(update).length === 1) {
    // Only updatedAt — nothing actually changed.
    throw new HttpsError('invalid-argument', 'No editable fields provided');
  }

  await ref.update(update);

  // ---- Price-change history (insights report) ----
  // Every startingPrice/reservePrice edit is recorded in a dedicated
  // subcollection so staff can see "how many times was this lowered" without
  // digging through audit_logs. Actor name is snapshotted for display.
  const priceFields: Array<'startingPrice' | 'reservePrice'> = [];
  if (v.startingPrice !== undefined && v.startingPrice !== a['startingPrice']) {
    priceFields.push('startingPrice');
  }
  if (v.reservePrice !== undefined && v.reservePrice !== (a['reservePrice'] ?? null)) {
    priceFields.push('reservePrice');
  }
  if (priceFields.length > 0) {
    // Insights price history is non-critical: a failure here must never block
    // the audit-log write below (a compliance artifact) nor turn the user's
    // already-committed edit into an error. Log and continue.
    try {
      const actorSnap = await adminDb().doc(`users/${actorUid}`).get();
      const ap = (actorSnap.data()?.['profile'] ?? {}) as Record<string, unknown>;
      const actorName =
        [ap['firstName'], ap['lastName']].filter(Boolean).join(' ') ||
        ((actorSnap.data()?.['email'] as string) ?? actorUid);
      const batch = adminDb().batch();
      for (const field of priceFields) {
        const from = (a[field] as number | undefined) ?? null;
        const to =
          field === 'reservePrice' && v.reservePrice === null ? null : (v[field] as number);
        batch.set(ref.collection('priceChanges').doc(), {
          field,
          from,
          to,
          isReduction: typeof from === 'number' && typeof to === 'number' && to < from,
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
