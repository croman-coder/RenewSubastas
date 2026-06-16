import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { adminDb, adminStorage } from '../lib/admin.js';
import { writeAuditLog } from '../lib/audit.js';
import { requireSignedIn } from '../lib/errors.js';
import { loadAppConfig } from '../lib/config.js';
import { sendEmail, RESEND_API_KEY } from '../lib/email.js';
import {
  emailShell,
  body,
  badge,
  heading,
  sectionLabel,
  dataRows,
  callout,
  ctaButton,
  SITE_URL,
} from '../lib/email-templates.js';
import { FieldValue } from 'firebase-admin/firestore';

const InputSchema = z.object({
  auctionId: z.string().min(1),
  // Storage path the client uploaded to:
  // payment-proofs/{auctionId}/{uid}-{ts}.{ext}
  storagePath: z.string().min(1).max(300),
});

export interface SubmitPaymentProofResult {
  ok: true;
}

// Payment-proof notifications go to administración (who verifies + approves
// the deposit with the finanzas role), CC to rsanchez, BCC to croman for
// oversight without exposing his address on the thread.
const ADMIN_TO = 'administracion@santarosa.com.py';
const ADMIN_CC = 'rsanchez@santarosa.com.py';
const ADMIN_BCC = 'croman@santarosa.com.py';

const fmtUsd = (n: number) =>
  n.toLocaleString('es-PY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Called when a winning buyer uploads their payment receipt
 * (comprobante de seña). Validates the caller is the auction's actual
 * winner, records the proof on the auction doc, downloads the file from
 * Storage, and emails the admin a full dossier — buyer identity +
 * contact, vehicle, amounts — with the receipt attached (PDF or image).
 *
 * Security: the Storage rule lets any active buyer write under
 * payment-proofs/, so the winner check HERE is the real gate. We refuse
 * if uid !== auction.winnerUid, and we refuse paths that don't live
 * under this auction's prefix (so a buyer can't attach someone else's
 * upload).
 */
export async function submitPaymentProofHandler(
  req: CallableRequest,
): Promise<SubmitPaymentProofResult> {
  const { uid } = requireSignedIn(req);
  const parsed = InputSchema.safeParse(req.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Invalid input');
  const { auctionId, storagePath } = parsed.data;

  if (!storagePath.startsWith(`payment-proofs/${auctionId}/`)) {
    throw new HttpsError('invalid-argument', 'storagePath does not match this auction');
  }

  const aRef = adminDb().doc(`auctions/${auctionId}`);
  const aSnap = await aRef.get();
  if (!aSnap.exists) throw new HttpsError('not-found', 'Auction not found');
  const a = aSnap.data()!;

  if (a['winnerUid'] !== uid) {
    throw new HttpsError('permission-denied', 'Only the winner can submit a payment proof');
  }
  if (a['status'] !== 'ended' || a['outcome'] !== 'sold') {
    throw new HttpsError('failed-precondition', 'Auction is not in a sold state');
  }

  // Buyer dossier.
  const uSnap = await adminDb().doc(`users/${uid}`).get();
  const u = uSnap.data() ?? {};
  const profile = (u['profile'] ?? {}) as Record<string, unknown>;
  const address = (profile['address'] ?? {}) as Record<string, unknown>;
  const buyerName =
    `${(profile['firstName'] as string) ?? ''} ${(profile['lastName'] as string) ?? ''}`.trim();
  const buyerEmail = (u['email'] as string) ?? '';
  const buyerPhone = (profile['phone'] as string) ?? '';
  const docType = (profile['documentType'] as string) ?? '';
  const docNumber = (profile['documentNumber'] as string) ?? '';

  // Vehicle dossier. The auction snapshot only carries make/model/year,
  // so fetch the full vehicle doc for the identifying fields (plate +
  // chassis/VIN) the admin needs to match the unit physically.
  const v = (a['vehicleSnapshot'] ?? {}) as Record<string, unknown>;
  const finalPrice = (a['finalPrice'] as number) ?? 0;
  const depositUsd = (a['paymentDepositUsd'] as number) ?? finalPrice * 0.1;

  const vehicleId = (a['vehicleId'] as string) ?? '';
  let vehFull: Record<string, unknown> = {};
  if (vehicleId) {
    const vSnap = await adminDb().doc(`vehicles/${vehicleId}`).get();
    vehFull = vSnap.data() ?? {};
  }
  const plate = (vehFull['licensePlate'] as string) ?? '';
  const vin = (vehFull['vin'] as string) ?? '';
  const mileage = vehFull['mileage'] as number | undefined;
  const color = (vehFull['color'] as string) ?? '';
  const transmission = (vehFull['transmission'] as string) ?? '';
  const fuelType = (vehFull['fuelType'] as string) ?? '';

  // Vanity reference: human-friendly auction code from the last 6 chars
  // of the id, uppercased. Readable + unique enough for support
  // ("subasta RNW-CWKJUK") without a sequential counter.
  const vanity = `RNW-${auctionId.slice(-6).toUpperCase()}`;

  // Record the proof on the auction so admin sees it in-app too.
  const downloadUrlBase = `https://firebasestorage.googleapis.com/v0/b/${adminStorage().bucket().name}/o/${encodeURIComponent(storagePath)}?alt=media`;
  await aRef.update({
    paymentProofPath: storagePath,
    paymentProofUrl: downloadUrlBase,
    paymentProofSubmittedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Download the receipt to attach it.
  let attachment: { filename: string; content: string } | null = null;
  try {
    const file = adminStorage().bucket().file(storagePath);
    const [buf] = await file.download();
    const ext = storagePath.split('.').pop() ?? 'bin';
    attachment = {
      filename: `comprobante-${auctionId}.${ext}`,
      content: buf.toString('base64'),
    };
  } catch (err) {
    console.warn('[submitPaymentProof] could not download proof for attachment', err);
  }

  const cfg = await loadAppConfig();
  const p = cfg.payment;

  const vehName = `${(v['make'] as string) ?? ''} ${(v['model'] as string) ?? ''} ${(v['year'] as number) ?? ''}`;
  const vehicleRows: Array<[string, string]> = [
    ['Vehículo', vehName],
    ['Chasis / VIN', vin],
    ['Chapa', plate],
  ];
  if (mileage != null) vehicleRows.push(['Kilometraje', `${mileage.toLocaleString('es-PY')} km`]);
  if (color) vehicleRows.push(['Color', color]);
  if (transmission) vehicleRows.push(['Transmisión', transmission]);
  if (fuelType) vehicleRows.push(['Combustible', fuelType]);
  vehicleRows.push(['Precio final', `USD ${fmtUsd(finalPrice)}`]);
  vehicleRows.push(['Seña esperada', `USD ${fmtUsd(depositUsd)}`]);
  vehicleRows.push(['Subasta', vanity]);

  const clientRows: Array<[string, string]> = [
    ['Nombre', buyerName],
    ['Email', buyerEmail],
    ['Teléfono', buyerPhone],
    ['Documento', docType && docNumber ? `${docType} ${docNumber}` : ''],
    [
      'Dirección',
      [address['street'], address['city'], address['department']].filter(Boolean).join(', '),
    ],
  ];

  const html = emailShell(
    body(
      badge('Comprobante recibido', 'info') +
        heading(
          vehName,
          'Un ganador subió su comprobante de seña. Revisá el adjunto y confirmá el pago en el panel.',
        ) +
        `<p style="margin:6px 0 0;font-size:12px;color:#71717a;font-weight:700;letter-spacing:0.5px;">Subasta ${vanity}</p>` +
        sectionLabel('Vehículo') +
        dataRows(vehicleRows) +
        sectionLabel('Cliente') +
        dataRows(clientRows) +
        callout(
          `Comprobante adjunto a este correo${attachment ? '' : ' (no se pudo adjuntar el archivo, revisá el panel)'}.`,
          'neutral',
        ) +
        ctaButton(`${SITE_URL}/es/staff/auctions/${auctionId}`, 'Abrir en el panel'),
    ),
  );

  await sendEmail({
    to: ADMIN_TO,
    cc: ADMIN_CC,
    bcc: ADMIN_BCC,
    subject: `Comprobante ${vanity} · ${(v['make'] as string) ?? ''} ${(v['model'] as string) ?? ''} · ${buyerName}`,
    html,
    ...(attachment ? { attachments: [attachment] } : {}),
  });

  await writeAuditLog({
    actorUid: uid,
    action: 'auction.payment_proof_submitted',
    resourceType: 'auction',
    resourceId: auctionId,
    after: { storagePath, buyerEmail },
  });

  return { ok: true };
}

export const submitPaymentProof = onCall(
  {
    region: 'us-central1',
    secrets: [RESEND_API_KEY],
    enforceAppCheck: process.env['ENFORCE_APP_CHECK'] === 'true',
  },
  submitPaymentProofHandler,
);
