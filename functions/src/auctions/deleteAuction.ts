import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { adminDb } from '../lib/admin.js';
import { writeAuditLog } from '../lib/audit.js';
import { requireSignedIn } from '../lib/errors.js';
import { DocId } from '../lib/ids.js';
import { FieldValue } from 'firebase-admin/firestore';

const InputSchema = z.object({ auctionId: DocId });

export interface DeleteAuctionResult {
  ok: true;
}

/**
 * Permanently deletes an auction. Admin or staff — used to clean up
 * mis-loaded / erroneous auctions that clutter the list.
 *
 * Guardrails (protect financial + bidder state):
 *   - A `live` auction with bids cannot be deleted — cancel it first.
 *   - A `sold` auction cannot be deleted (it has a winner + payment
 *     state). Those are history.
 *   - Allowed: `scheduled` (not yet open), `cancelled`, and `ended`
 *     auctions whose outcome was no_bids / reserve_not_met (no winner).
 *   - Frees the linked vehicle back to `ready` if it was held
 *     `in_auction` by this auction.
 *
 * Bids subcollection is deleted with the auction. The audit log entry
 * remains as the record that the auction existed and was removed.
 */
export async function deleteAuctionHandler(req: CallableRequest): Promise<DeleteAuctionResult> {
  const { uid: actorUid, role } = requireSignedIn(req);
  if (role !== 'admin' && role !== 'staff') {
    throw new HttpsError('permission-denied', 'Only admin or staff can delete auctions');
  }
  const parsed = InputSchema.safeParse(req.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Invalid input');
  const { auctionId } = parsed.data;

  const db = adminDb();
  const ref = db.doc(`auctions/${auctionId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Auction not found');
  const a = snap.data()!;
  const status = a['status'] as string;
  const outcome = a['outcome'] as string | undefined;
  const bidCount = (a['bidCount'] as number) ?? 0;

  if (status === 'sold' || outcome === 'sold') {
    throw new HttpsError('failed-precondition', 'Cannot delete a sold auction.');
  }
  if (status === 'live' && bidCount > 0) {
    throw new HttpsError(
      'failed-precondition',
      'This live auction has bids. Cancel it first, then delete.',
    );
  }

  // Free the vehicle if it was held by this auction.
  const vehicleId = a['vehicleId'] as string | undefined;
  if (vehicleId) {
    const vRef = db.doc(`vehicles/${vehicleId}`);
    const vSnap = await vRef.get();
    if (vSnap.exists && vSnap.data()?.['status'] === 'in_auction') {
      await vRef.update({ status: 'ready', updatedAt: FieldValue.serverTimestamp() });
    }
  }

  // Delete bids subcollection (small — one auction's bids).
  const bids = await ref.collection('bids').get();
  for (const b of bids.docs) await b.ref.delete();

  await ref.delete();

  await writeAuditLog({
    actorUid,
    action: 'auction.delete',
    resourceType: 'auction',
    resourceId: auctionId,
    before: { status, outcome: outcome ?? null, bidCount },
  });

  return { ok: true };
}

export const deleteAuction = onCall(
  { region: 'us-central1', enforceAppCheck: process.env['ENFORCE_APP_CHECK'] !== 'false' },
  deleteAuctionHandler,
);
