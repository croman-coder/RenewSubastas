import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { adminDb, adminStorage } from '../lib/admin.js';
import { writeAuditLog } from '../lib/audit.js';
import { requireSignedIn } from '../lib/errors.js';
import { DocId } from '../lib/ids.js';
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
  esc,
  SITE_URL,
} from '../lib/email-templates.js';
import { FieldValue } from 'firebase-admin/firestore';

const InputSchema = z.object({
  auctionId: DocId,
  // Storage path the client uploaded to:
  // payment-proofs/{auctionId}/{uid}/{ts}.{ext}
  storagePath: z.string().min(1).max(300),
});

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60_000;
const MAX_PROOF_BYTES = 10 * 1024 * 1024;

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
 * Security: storage.rules now ALSO checks the caller is the auction's
 * winnerUid before allowing the write (via firestore.get()), so this is
 * defense-in-depth rather than the sole gate. We refuse if uid !==
 * auction.winnerUid, and we refuse paths that don't live under this
 * auction's AND this caller's own uid segment (so a buyer can't attach
 * someone else's upload, or one from a different auction). Rate-limited
 * per auction (5 / 10min) since every call costs a Storage download + an
 * email with attachment, and the object's actual size/contentType are
 * verified against Storage metadata before it's trusted as a receipt.
 */
export async function submitPaymentProofHandler(
  req: CallableRequest,
): Promise<SubmitPaymentProofResult> {
  const { uid } = requireSignedIn(req);
  const parsed = InputSchema.safeParse(req.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Invalid input');
  const { auctionId, storagePath } = parsed.data;

  if (!storagePath.startsWith(`payment-proofs/${auctionId}/${uid}/`)) {
    throw new HttpsError('invalid-argument', 'storagePath does not match this auction/caller');
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
  // Reject proofs once the payment window is closed: a 'forfeited' (deadline
  // passed, swept by tickAuctions) or already 'paid' auction must not accept a
  // late comprobante — otherwise a buyer could "pay" for a car that was
  // already returned to the catalog and possibly re-sold.
  if (a['paymentStatus'] && a['paymentStatus'] !== 'pending_payment') {
    const reason =
      a['paymentStatus'] === 'paid'
        ? 'El pago de esta subasta ya fue confirmado.'
        : 'El plazo para enviar el comprobante venció.';
    throw new HttpsError('failed-precondition', reason);
  }

  // Rate limit: each call downloads from Storage and emails admin a full
  // dossier with attachment, so an uncapped winner retrying (or scripting)
  // this endpoint turns into a Storage/Resend cost multiplier. Scoped per
  // auction — only the winner can pass the check above, so this is
  // effectively per-winner for this sale.
  const rlRef = adminDb().doc(`rate_limits/paymentproof_${auctionId}`);
  await adminDb().runTransaction(async (tx) => {
    const rlSnap = await tx.get(rlRef);
    const now = Date.now();
    const recent = ((rlSnap.data()?.['timestamps'] as number[] | undefined) ?? []).filter(
      (t) => now - t < RATE_LIMIT_WINDOW_MS,
    );
    if (recent.length >= RATE_LIMIT_MAX) {
      throw new HttpsError('resource-exhausted', 'Demasiados intentos. Probá de nuevo más tarde.');
    }
    tx.set(rlRef, { timestamps: [...recent, now] });
  });

  // Metadata trust: storage.rules already enforce size/contentType at
  // upload time, but this handler shouldn't blindly trust that a
  // client-supplied storagePath still points at something matching those
  // constraints (rules regression, manual console upload, direct Admin SDK
  // write elsewhere). Verify the ACTUAL object before treating it as a
  // valid receipt and emailing it to admin.
  const file = adminStorage().bucket().file(storagePath);
  const [fileMeta] = await file.getMetadata().catch(() => [null]);
  if (!fileMeta) {
    throw new HttpsError(
      'failed-precondition',
      'El comprobante no se encontró en el almacenamiento.',
    );
  }
  const proofSize = Number(fileMeta.size ?? 0);
  const proofContentType = fileMeta.contentType ?? '';
  const proofTypeOk =
    proofContentType.startsWith('image/') || proofContentType === 'application/pdf';
  if (proofSize > MAX_PROOF_BYTES || !proofTypeOk) {
    throw new HttpsError('failed-precondition', 'El archivo no cumple los requisitos esperados.');
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

  // Download the receipt to attach it. Metadata already validated above —
  // a failure here would be a transient Storage error, not a bad file.
  let attachment: { filename: string; content: string } | null = null;
  try {
    const [buf] = await file.download();
    const ext = storagePath.split('.').pop() ?? 'bin';
    attachment = {
      filename: `comprobante-${auctionId}.${ext}`,
      content: buf.toString('base64'),
    };
  } catch (err) {
    console.warn('[submitPaymentProof] could not download proof for attachment', err);
  }

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

  // Escaped here (not on buyerName/buyerEmail/... themselves) — those raw
  // values are also used in the plain-text email subject and audit log
  // below, where HTML-escaping would corrupt the output.
  const clientRows: Array<[string, string]> = [
    ['Nombre', esc(buyerName)],
    ['Email', esc(buyerEmail)],
    ['Teléfono', esc(buyerPhone)],
    ['Documento', docType && docNumber ? esc(`${docType} ${docNumber}`) : ''],
    [
      'Dirección',
      esc([address['street'], address['city'], address['department']].filter(Boolean).join(', ')),
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
    enforceAppCheck: process.env['ENFORCE_APP_CHECK'] !== 'false',
  },
  submitPaymentProofHandler,
);
