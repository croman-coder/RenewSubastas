import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { adminDb } from '../lib/admin.js';
import { writeAuditLog } from '../lib/audit.js';
import { requireSignedIn } from '../lib/errors.js';
import { DocId } from '../lib/ids.js';
import { FieldValue } from 'firebase-admin/firestore';
import { sendEmail, RESEND_API_KEY } from '../lib/email.js';
import {
  emailShell,
  body,
  badge,
  heading,
  statPair,
  sectionLabel,
  dataRows,
  callout,
} from '../lib/email-templates.js';

// Sales-team recipients for the "seña confirmada, avanzar facturación" notice.
const SALES_TO = 'rsanchez@santarosa.com.py';
const SALES_CC = 'evigorito@santarosa.com.py';
const SALES_BCC = 'croman@santarosa.com.py';

const fmtUsd = (n: number) =>
  n.toLocaleString('es-PY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const InputSchema = z.object({
  auctionId: DocId,
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
  const { uid: actorUid, role } = requireSignedIn(req);
  if (role !== 'admin' && role !== 'finanzas') {
    throw new HttpsError('permission-denied', 'Only admin or finanzas can confirm payments');
  }
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

  // On a confirmed payment, notify (1) the winning buyer that Santa Rosa
  // Paraguay SA confirmed their seña, and (2) the sales lead to start
  // invoicing, with full buyer + vehicle data. Best-effort: email failures
  // never block the confirmation that already persisted above.
  if (action === 'paid') {
    try {
      await sendPaidNotifications(auctionId, data);
    } catch (err) {
      console.error('[confirmAuctionPayment] paid notifications failed', err);
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

async function sendPaidNotifications(auctionId: string, a: Record<string, unknown>): Promise<void> {
  const v = (a['vehicleSnapshot'] ?? {}) as Record<string, unknown>;
  const finalPrice = (a['finalPrice'] as number) ?? 0;
  const depositUsd = (a['paymentDepositUsd'] as number) ?? finalPrice * 0.1;
  const vanity = `RNW-${auctionId.slice(-6).toUpperCase()}`;
  const vehName =
    `${(v['make'] as string) ?? ''} ${(v['model'] as string) ?? ''} ${(v['year'] as number) ?? ''}`.trim();

  // Full vehicle detail (plate/vin/specs) for the invoicing notice.
  const vehicleId = (a['vehicleId'] as string) ?? '';
  let vf: Record<string, unknown> = {};
  if (vehicleId) vf = (await adminDb().doc(`vehicles/${vehicleId}`).get()).data() ?? {};

  // Winner contact data.
  const winnerUid = (a['winnerUid'] as string) ?? '';
  let u: Record<string, unknown> = {};
  if (winnerUid) u = (await adminDb().doc(`users/${winnerUid}`).get()).data() ?? {};
  const profile = (u['profile'] ?? {}) as Record<string, unknown>;
  const buyerName =
    `${(profile['firstName'] as string) ?? ''} ${(profile['lastName'] as string) ?? ''}`.trim();
  const buyerEmail = (u['email'] as string) ?? '';
  const buyerPhone = (profile['phone'] as string) ?? '';
  const docType = (profile['documentType'] as string) ?? '';
  const docNumber = (profile['documentNumber'] as string) ?? '';

  // 1) Client confirmation.
  if (buyerEmail) {
    const clientHtml = emailShell(
      body(
        badge('Pago confirmado', 'success') +
          heading(
            `¡Confirmamos tu pago, ${(profile['firstName'] as string) ?? ''}!`.trim(),
            `<strong style="color:#0a0a0a;">Santa Rosa Paraguay SA</strong> confirmó la seña de tu <strong style="color:#0a0a0a;">${vehName}</strong>. La unidad queda reservada a tu nombre.`,
          ) +
          statPair(
            { label: 'Precio final', value: `USD ${fmtUsd(finalPrice)}` },
            { label: 'Seña confirmada', value: `USD ${fmtUsd(depositUsd)}`, strong: true },
          ) +
          callout(
            'Nuestro equipo de ventas se va a contactar con vos para coordinar la facturación y la entrega. ¡Gracias por tu compra!',
            'success',
          ),
      ),
    );
    await sendEmail({
      to: buyerEmail,
      subject: `Pago confirmado · ${vehName} · ${vanity}`,
      html: clientHtml,
    });
  }

  // 2) Sales-lead invoicing notice.
  const vehicleRows: Array<[string, string]> = [['Vehículo', vehName]];
  if (vf['vin']) vehicleRows.push(['Chasis / VIN', vf['vin'] as string]);
  if (vf['licensePlate']) vehicleRows.push(['Chapa', vf['licensePlate'] as string]);
  if (vf['mileage'] != null)
    vehicleRows.push(['Kilometraje', `${(vf['mileage'] as number).toLocaleString('es-PY')} km`]);
  if (vf['color']) vehicleRows.push(['Color', vf['color'] as string]);
  vehicleRows.push(['Subasta', vanity]);

  const clientRows: Array<[string, string]> = [
    ['Nombre', buyerName],
    ['Email', buyerEmail],
    ['Teléfono', buyerPhone],
    ['Documento', docType && docNumber ? `${docType} ${docNumber}` : ''],
  ];

  const salesHtml = emailShell(
    body(
      badge('Seña confirmada', 'success') +
        heading(
          'Avanzar con la facturación',
          `<strong style="color:#0a0a0a;">Santa Rosa Paraguay SA</strong> confirmó la seña de la unidad. Procedé con la facturación a nombre del cliente.`,
        ) +
        statPair(
          { label: 'Precio final', value: `USD ${fmtUsd(finalPrice)}` },
          { label: 'Seña confirmada', value: `USD ${fmtUsd(depositUsd)}`, strong: true },
        ) +
        sectionLabel('Vehículo') +
        dataRows(vehicleRows) +
        sectionLabel('Cliente') +
        dataRows(clientRows),
    ),
  );
  await sendEmail({
    to: SALES_TO,
    cc: SALES_CC,
    bcc: SALES_BCC,
    subject: `Seña confirmada · facturar ${vehName} · ${vanity}`,
    html: salesHtml,
  });
}

export const confirmAuctionPayment = onCall(
  {
    region: 'us-central1',
    secrets: [RESEND_API_KEY],
    enforceAppCheck: process.env['ENFORCE_APP_CHECK'] !== 'false',
  },
  confirmAuctionPaymentHandler,
);
