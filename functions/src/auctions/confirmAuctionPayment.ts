import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { adminDb } from '../lib/admin.js';
import { writeAuditLog } from '../lib/audit.js';
import { requireAdmin } from '../lib/errors.js';
import { FieldValue } from 'firebase-admin/firestore';

const InputSchema = z.object({
  auctionId: z.string().min(1),
  // What the admin is recording. `paid` confirms the seña arrived;
  // `forfeited` lets admin manually release the auction before the
  // automatic deadline (e.g. buyer cancelled in person).
  action: z.enum(['paid', 'forfeited']),
  /** Free-text note shown in the audit log (e.g. transfer reference). */
  note: z.string().max(500).optional(),
});

export interface ConfirmAuctionPaymentResult {
  ok: true;
}

export async function confirmAuctionPaymentHandler(
  req: CallableRequest,
): Promise<ConfirmAuctionPaymentResult> {
  const { uid: actorUid } = requireAdmin(req);
  const parsed = InputSchema.safeParse(req.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Invalid input');
  const { auctionId, action, note } = parsed.data;

  const ref = adminDb().doc(`auctions/${auctionId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Auction not found');
  const data = snap.data()!;
  if (data['status'] !== 'ended' || data['outcome'] !== 'sold') {
    throw new HttpsError(
      'failed-precondition',
      'Only ended/sold auctions can record payment state',
    );
  }

  const currentPaymentStatus = data['paymentStatus'] as string | undefined;
  if (currentPaymentStatus === action) {
    // Idempotent: re-confirming the same status is a no-op.
    return { ok: true };
  }

  const update: Record<string, unknown> = {
    paymentStatus: action,
    paymentStatusUpdatedAt: FieldValue.serverTimestamp(),
    paymentStatusUpdatedBy: actorUid,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (note) update['paymentNote'] = note;

  await ref.update(update);

  // When a sale is forfeited, free the vehicle back to the catalog so
  // staff can re-list it. Paid sales leave the vehicle in `sold`.
  if (action === 'forfeited') {
    const vehicleId = data['vehicleId'] as string | undefined;
    if (vehicleId) {
      await adminDb().doc(`vehicles/${vehicleId}`).update({
        status: 'ready',
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }

  await writeAuditLog({
    actorUid,
    action: action === 'paid' ? 'auction.payment_confirmed' : 'auction.forfeited',
    resourceType: 'auction',
    resourceId: auctionId,
    before: { paymentStatus: currentPaymentStatus ?? null },
    after: { paymentStatus: action, note: note ?? null },
  });

  return { ok: true };
}

export const confirmAuctionPayment = onCall(
  { region: 'us-central1', enforceAppCheck: process.env['ENFORCE_APP_CHECK'] === 'true' },
  confirmAuctionPaymentHandler,
);
