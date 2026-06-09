import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { adminDb, adminStorage } from '../lib/admin.js';
import { writeAuditLog } from '../lib/audit.js';
import { requireSignedIn } from '../lib/errors.js';
import { loadAppConfig } from '../lib/config.js';
import { sendEmail, RESEND_API_KEY } from '../lib/email.js';
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

const LOGO = 'https://renewsubastas.netlify.app/brand/renew-wordmark-black.png';
// Until santarosa.com.py is verified in Resend, send from the onboarding
// sender so the notification actually reaches the admin inbox.
const FROM = 'Renew Subastas <onboarding@resend.dev>';
const ADMIN_TO = 'croman@santarosa.com.py';

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

  // Vehicle dossier.
  const v = (a['vehicleSnapshot'] ?? {}) as Record<string, unknown>;
  const finalPrice = (a['finalPrice'] as number) ?? 0;
  const depositUsd = (a['paymentDepositUsd'] as number) ?? finalPrice * 0.1;

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

  const row = (label: string, value: string) =>
    `<tr><td style="padding:5px 0;color:#71717a;width:150px;font-size:13px;">${label}</td><td style="padding:5px 0;font-weight:600;font-size:13px;color:#0f0f0f;">${value || '—'}</td></tr>`;

  const html = `
  <div style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:600px;margin:0 auto;padding:32px 16px;">
      <div style="background:#fff;border:1px solid #e4e4e7;border-radius:16px;overflow:hidden;">
        <div style="padding:28px 32px 0;">
          <img src="${LOGO}" alt="Renew Subastas" height="24" style="display:block;height:24px;width:auto;" />
        </div>
        <div style="padding:20px 32px 8px;">
          <div style="display:inline-block;background:#dbeafe;color:#1e40af;font-size:11px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;padding:4px 10px;border-radius:999px;">
            Comprobante de seña recibido
          </div>
          <h1 style="margin:14px 0 4px;font-size:22px;color:#0f0f0f;font-weight:800;">
            ${(v['make'] as string) ?? ''} ${(v['model'] as string) ?? ''} ${(v['year'] as number) ?? ''}
          </h1>
          <p style="margin:0 0 18px;font-size:14px;color:#52525b;">
            Un ganador subió su comprobante. Revisá el adjunto y confirmá la seña en el panel.
          </p>

          <h2 style="margin:18px 0 4px;font-size:13px;color:#0f0f0f;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Vehículo</h2>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            ${row('Vehículo', `${(v['make'] as string) ?? ''} ${(v['model'] as string) ?? ''} ${(v['year'] as number) ?? ''}`)}
            ${row('Precio final', `USD ${fmtUsd(finalPrice)}`)}
            ${row('Seña esperada', `USD ${fmtUsd(depositUsd)}`)}
            ${row('Subasta', auctionId)}
          </table>

          <h2 style="margin:20px 0 4px;font-size:13px;color:#0f0f0f;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Cliente</h2>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            ${row('Nombre', buyerName)}
            ${row('Email', buyerEmail)}
            ${row('Teléfono', buyerPhone)}
            ${row('Documento', docType && docNumber ? `${docType} ${docNumber}` : '')}
            ${row('Dirección', [address['street'], address['city'], address['department']].filter(Boolean).join(', '))}
          </table>

          <div style="background:#f5f5f5;border-radius:10px;padding:12px 14px;margin:18px 0;">
            <p style="margin:0;font-size:12px;color:#52525b;">
              Comprobante adjunto a este correo${attachment ? '' : ' (no se pudo adjuntar el archivo — revisá el panel)'}.
              ${p.contactPhone ? `Contacto cargado: ${p.contactPhone}.` : ''}
            </p>
          </div>

          <a href="https://renewsubastas.netlify.app/es/staff/auctions/${auctionId}" style="display:inline-block;background:#0f0f0f;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:10px;">
            Abrir en el panel
          </a>
        </div>
        <div style="padding:20px 32px 28px;border-top:1px solid #f0f0f0;margin-top:8px;">
          <p style="margin:0;font-size:11px;color:#a1a1aa;">Renew Subastas · Santa Rosa Automotores</p>
        </div>
      </div>
    </div>
  </div>`;

  await sendEmail({
    to: ADMIN_TO,
    from: FROM,
    subject: `Comprobante de seña · ${(v['make'] as string) ?? ''} ${(v['model'] as string) ?? ''} · ${buyerName}`,
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
