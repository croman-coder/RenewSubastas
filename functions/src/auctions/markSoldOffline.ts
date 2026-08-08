import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '../lib/admin.js';
import { writeAuditLog } from '../lib/audit.js';
import { requireSignedIn } from '../lib/errors.js';
import { DocId } from '../lib/ids.js';

const MAX_PRICE_USD = 10_000_000;

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
      soldOfflinePriceUsd: soldPriceUsd,
      soldOfflineAt: FieldValue.serverTimestamp(),
      soldOfflineBy: uid,
      updatedAt: FieldValue.serverTimestamp(),
    });

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
