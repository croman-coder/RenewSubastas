import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '../lib/admin.js';
import { writeAuditLog } from '../lib/audit.js';
import { requireSignedIn } from '../lib/errors.js';
import { DocId } from '../lib/ids.js';

// Same ceiling as createAuction.ts / updateAuction.ts for the identical
// inventory (startingPrice/reservePrice/buyNowPrice) — nothing about a
// showroom sale of the same vehicle justifies a higher cap, and there is no
// callable that can correct this field after the fact.
const MAX_PRICE_USD = 200_000;

const InputSchema = z.object({
  auctionId: DocId,
  soldPriceUsd: z.number().positive().finite().max(MAX_PRICE_USD),
});

export interface MarkSoldOfflineResult {
  ok: true;
}

/**
 * Marca una unidad como vendida fuera de la plataforma (salón).
 *
 * Deliberadamente NO reusa closeAuctionAsSold: esa función existe para
 * escribir los campos de dinero de una venta de plataforma —ganador, seña,
 * plazo— y acá no hay ninguno. Forzarla con banderas la convertiría en la
 * cosa que se quiso evitar al extraerla.
 *
 * El resultado `sold_offline` queda fuera del GMV a propósito: no hubo puja
 * ganadora ni pago que gestionar, y mezclarlo mentiría en los reportes.
 */
export async function markSoldOfflineHandler(req: CallableRequest): Promise<MarkSoldOfflineResult> {
  const { uid, role } = requireSignedIn(req);
  if (role !== 'admin' && role !== 'staff') {
    throw new HttpsError('permission-denied', 'Sólo admin o staff pueden marcar una venta.');
  }
  const parsed = InputSchema.safeParse(req.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Invalid input');
  const { auctionId, soldPriceUsd } = parsed.data;

  const db = adminDb();
  const auctionRef = db.doc(`auctions/${auctionId}`);
  // soldOfflinePriceUsd/soldOfflineAt/soldOfflineBy live here, not on the
  // parent doc — same split as reservePrice (see AuctionPrivateSchema). The
  // parent doc is buyer-readable (firestore.rules' audience match), and the
  // showroom sale price is internal reporting data a buyer who lost the
  // auction has no claim to seeing.
  const privateRef = auctionRef.collection('private').doc('internal');

  await db.runTransaction(async (tx) => {
    const aSnap = await tx.get(auctionRef);
    if (!aSnap.exists) throw new HttpsError('not-found', 'Auction not found');
    const a = aSnap.data()!;

    const status = a['status'] as string;
    if (status !== 'live' && status !== 'scheduled') {
      throw new HttpsError('failed-precondition', 'Esta subasta ya está cerrada.');
    }

    const vehicleId = a['vehicleId'] as string | undefined;
    const vehicleRef = vehicleId ? db.doc(`vehicles/${vehicleId}`) : null;
    const vehicleSnap = vehicleRef ? await tx.get(vehicleRef) : null;

    const activeBids = await tx.get(auctionRef.collection('bids').where('status', '==', 'winning'));

    // Sólo escrituras a partir de acá.
    tx.update(auctionRef, {
      status: 'ended',
      outcome: 'sold_offline',
      // The displaced bidder is no longer "the top bidder" — leaving this
      // set would have bid-panel.tsx's isWinning/iWon (currentBidderUid ===
      // myUid && currentBid > 0, on an auction that is now ended) read as
      // true for them, rendering "¡Ganaste la subasta!" to the person whose
      // vehicle was just sold to someone else in the showroom. currentBid
      // stays: it's a true historical fact (the high bid when the unit was
      // pulled), and the bids sub-collection keeps full per-bidder history
      // regardless.
      currentBidderUid: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(
      privateRef,
      {
        soldOfflinePriceUsd: soldPriceUsd,
        soldOfflineAt: FieldValue.serverTimestamp(),
        soldOfflineBy: uid,
      },
      { merge: true },
    );

    if (vehicleRef && vehicleSnap?.exists) {
      tx.update(vehicleRef, { status: 'sold', updatedAt: FieldValue.serverTimestamp() });
    }

    activeBids.forEach((d) => tx.update(d.ref, { status: 'outbid' }));
  });

  await writeAuditLog({
    actorUid: uid,
    action: 'auction.sold_offline',
    resourceType: 'auction',
    resourceId: auctionId,
    after: { soldPriceUsd },
  }).catch((err) => console.error('[markSoldOffline] audit log failed', err));

  return { ok: true };
}

export const markSoldOffline = onCall(
  { region: 'us-central1', enforceAppCheck: process.env['ENFORCE_APP_CHECK'] !== 'false' },
  markSoldOfflineHandler,
);
