import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { adminDb } from '../lib/admin.js';
import { writeAuditLog } from '../lib/audit.js';
import { requireSignedIn } from '../lib/errors.js';
import { DocId } from '../lib/ids.js';
import { FieldValue } from 'firebase-admin/firestore';

const InputSchema = z.object({
  auctionId: DocId,
});

export interface CancelAuctionResult {
  ok: true;
}

export async function cancelAuctionHandler(req: CallableRequest): Promise<CancelAuctionResult> {
  const { uid: actorUid, role } = requireSignedIn(req);
  if (role !== 'staff' && role !== 'admin') {
    throw new HttpsError('permission-denied', 'Only staff or admin can cancel auctions');
  }
  const parsed = InputSchema.safeParse(req.data);
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Invalid input', parsed.error.flatten());
  }
  const { auctionId } = parsed.data;

  const db = adminDb();
  const auctionRef = db.doc(`auctions/${auctionId}`);

  await db.runTransaction(async (tx) => {
    // Firestore transactions require ALL reads to happen before any writes,
    // otherwise the transaction fails with INTERNAL. Read both docs up-front,
    // validate, then issue the writes at the end.
    const aSnap = await tx.get(auctionRef);
    if (!aSnap.exists) {
      throw new HttpsError('not-found', 'Auction not found');
    }
    const aData = aSnap.data()!;
    const status = aData['status'] as string | undefined;
    if (status === 'ended' || status === 'cancelled') {
      throw new HttpsError('failed-precondition', `Cannot cancel an auction in status "${status}"`);
    }

    const vehicleId = aData['vehicleId'] as string | undefined;
    const vehicleRef = vehicleId ? db.doc(`vehicles/${vehicleId}`) : null;
    const vSnap = vehicleRef ? await tx.get(vehicleRef) : null;
    const shouldFreeVehicle =
      !!vehicleRef && !!vSnap?.exists && vSnap.data()?.['status'] === 'in_auction';

    tx.update(auctionRef, {
      status: 'cancelled',
      cancelledAt: FieldValue.serverTimestamp(),
      cancelledBy: actorUid,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Free up the vehicle so it can be auctioned again later if desired.
    if (shouldFreeVehicle && vehicleRef) {
      tx.update(vehicleRef, {
        status: 'ready',
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  });

  await writeAuditLog({
    actorUid,
    action: 'auction.cancel',
    resourceType: 'auction',
    resourceId: auctionId,
  });

  return { ok: true };
}

export const cancelAuction = onCall(
  { region: 'us-central1', enforceAppCheck: process.env['ENFORCE_APP_CHECK'] !== 'false' },
  cancelAuctionHandler,
);
