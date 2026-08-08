import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '../lib/admin.js';
import { writeAuditLog } from '../lib/audit.js';
import { requireSignedIn } from '../lib/errors.js';
import { DocId } from '../lib/ids.js';
import { loadAppConfig } from '../lib/config.js';
import { closeAuctionAsSold } from '../lib/close-auction.js';

const InputSchema = z.object({ auctionId: DocId });

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;

export interface BuyNowResult {
  ok: true;
  finalPrice: number;
}

/**
 * Compra directa a precio fijo.
 *
 * Cierra la subasta al instante produciendo exactamente la misma transición
 * de documento que un cierre por vencimiento (status=ended, outcome=sold,
 * winnerUid), así que sendAuctionWon, la página /won, la subida de
 * comprobante y el barrido de vencimiento funcionan sin cambios.
 *
 * El botón desaparece del cliente con la primera puja, pero eso se revalida
 * acá: alguien puede tener la página vieja abierta.
 */
export async function buyNowHandler(req: CallableRequest): Promise<BuyNowResult> {
  const { uid, role } = requireSignedIn(req);
  if (role !== 'buyer') {
    throw new HttpsError('permission-denied', 'Sólo un comprador puede usar Compra ya.');
  }
  const parsed = InputSchema.safeParse(req.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Invalid input');
  const { auctionId } = parsed.data;

  const callerAudience = (req.auth!.token['audience'] as string | undefined) ?? 'retail';

  const db = adminDb();
  const cfg = await loadAppConfig().catch(() => null);
  const deadlineHours = cfg?.payment.deadlineHours ?? 24;
  const depositPercent = cfg?.payment.depositPercent ?? 0.1;

  const auctionRef = db.doc(`auctions/${auctionId}`);
  const rlRef = db.doc(`rate_limits/buynow_${uid}`);
  const userRef = db.doc(`users/${uid}`);

  const finalPrice = await db.runTransaction(async (tx) => {
    const now = Date.now();

    // Todas las lecturas primero.
    const rlSnap = await tx.get(rlRef);
    const aSnap = await tx.get(auctionRef);
    const uSnap = await tx.get(userRef);

    const recent = ((rlSnap.data()?.['timestamps'] as number[] | undefined) ?? []).filter(
      (t) => now - t < RATE_LIMIT_WINDOW_MS,
    );
    if (recent.length >= RATE_LIMIT_MAX) {
      throw new HttpsError(
        'resource-exhausted',
        'Demasiados intentos. Probá de nuevo en un minuto.',
      );
    }

    if (!aSnap.exists) throw new HttpsError('not-found', 'Auction not found');
    const a = aSnap.data()!;

    const auctionAudience = (a['audience'] as string | undefined) ?? 'retail';
    if (auctionAudience !== callerAudience) {
      throw new HttpsError('permission-denied', 'Esta unidad no pertenece a tu catálogo.');
    }

    if (a['status'] !== 'live') {
      throw new HttpsError('failed-precondition', 'Esta subasta no está activa.');
    }
    const endsAt = a['endsAt'] as Timestamp;
    if (endsAt.toMillis() <= now) {
      throw new HttpsError('failed-precondition', 'Esta subasta ya cerró.');
    }
    if (((a['bidCount'] as number) ?? 0) > 0) {
      throw new HttpsError(
        'failed-precondition',
        'Ya hay pujas en esta subasta: para participar tenés que pujar.',
      );
    }
    const buyNowPrice = a['buyNowPrice'] as number | undefined;
    if (buyNowPrice === undefined) {
      throw new HttpsError('failed-precondition', 'Esta subasta no admite compra directa.');
    }

    const profile = (uSnap.data()?.['profile'] ?? {}) as Record<string, unknown>;
    if (!profile['documentType'] || !profile['documentNumber']) {
      throw new HttpsError('failed-precondition', 'profile_incomplete');
    }

    const vehicleId = a['vehicleId'] as string | undefined;
    const vehicleRef = vehicleId ? db.doc(`vehicles/${vehicleId}`) : null;
    const vehicleSnap = vehicleRef ? await tx.get(vehicleRef) : null;

    // A partir de acá, sólo escrituras.
    closeAuctionAsSold(tx, {
      auctionRef,
      vehicleRef: vehicleSnap?.exists ? vehicleRef : null,
      winnerUid: uid,
      finalPrice: buyNowPrice,
      depositPercent,
      deadlineHours,
      nowMs: now,
    });

    tx.update(auctionRef, {
      currentBid: buyNowPrice,
      currentBidderUid: uid,
      bidCount: FieldValue.increment(1),
    });

    // Deja rastro en el historial: sin esto el panel de Pujas y el historial
    // del comprador mostrarían una venta sin ninguna operación detrás.
    const bidRef = auctionRef.collection('bids').doc();
    tx.set(bidRef, {
      id: bidRef.id,
      auctionId,
      buyerUid: uid,
      buyerSnapshot: {
        firstName: (profile['firstName'] as string) ?? '',
        lastInitial: ((profile['lastName'] as string) ?? '').charAt(0).toUpperCase() || '?',
      },
      amount: buyNowPrice,
      createdAt: FieldValue.serverTimestamp(),
      status: 'winning',
      displacedBuyerUid: null,
      displacedAmount: null,
      source: 'buy_now',
    });

    tx.set(rlRef, { timestamps: [...recent, now] });

    return buyNowPrice;
  });

  await writeAuditLog({
    actorUid: uid,
    action: 'auction.buy_now',
    resourceType: 'auction',
    resourceId: auctionId,
    after: { finalPrice },
  }).catch((err) => console.error('[buyNow] audit log failed', err));

  return { ok: true, finalPrice };
}

export const buyNow = onCall(
  { region: 'us-central1', enforceAppCheck: process.env['ENFORCE_APP_CHECK'] !== 'false' },
  buyNowHandler,
);
