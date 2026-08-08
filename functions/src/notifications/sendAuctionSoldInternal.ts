import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '../lib/admin.js';
import { sendEmail, RESEND_API_KEY } from '../lib/email.js';
import {
  emailShell,
  body,
  badge,
  heading,
  statPair,
  sectionLabel,
  dataRows,
  ctaButton,
  esc,
  SITE_URL,
} from '../lib/email-templates.js';

/** Administración gestiona el cobro de la seña; siempre va en el aviso. */
const ADMIN_TO = 'administracion@santarosa.com.py';

const fmtUsd = (n: number) =>
  n.toLocaleString('es-PY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface InternalSoldEmailArgs {
  vanity: string;
  vehName: string;
  finalPrice: number;
  depositUsd: number;
  deadlineText: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  buyerDoc: string;
  viaBuyNow: boolean;
}

/**
 * Arma el correo. Separado del trigger para poder testear el contenido sin
 * emulador de Firestore ni red.
 *
 * Todo valor que rastree hasta datos cargados por un usuario (nombre/email/
 * teléfono/documento del comprador, make/model del vehículo) pasa por esc()
 * antes de interpolarse — este es un correo interno, pero una bandeja
 * interna sigue siendo un objetivo válido de HTML injection.
 */
export function buildInternalSoldEmail(a: InternalSoldEmailArgs): {
  subject: string;
  html: string;
} {
  const via = a.viaBuyNow ? 'Compra ya' : 'Subasta ganada';
  const html = emailShell(
    body(
      badge(via, a.viaBuyNow ? 'info' : 'success') +
        heading(
          esc(a.vehName),
          `Se adjudicó una unidad por <strong style="color:#0a0a0a;">${esc(via)}</strong>. Administración debe gestionar el cobro de la seña.`,
        ) +
        `<p style="margin:6px 0 0;font-size:12px;color:#71717a;font-weight:700;letter-spacing:0.5px;">Subasta ${esc(a.vanity)}</p>` +
        statPair(
          { label: 'Precio final', value: `USD ${fmtUsd(a.finalPrice)}` },
          { label: 'Seña esperada', value: `USD ${fmtUsd(a.depositUsd)}`, strong: true },
        ) +
        sectionLabel('Comprador') +
        dataRows([
          ['Nombre', esc(a.buyerName)],
          ['Email', esc(a.buyerEmail)],
          ['Teléfono', esc(a.buyerPhone)],
          ['Documento', esc(a.buyerDoc)],
        ]) +
        sectionLabel('Plazo') +
        dataRows([['Vence', esc(a.deadlineText)]]) +
        ctaButton(`${SITE_URL}/es/staff/auctions`, 'Abrir en el panel'),
    ),
  );
  return { subject: `${via} · ${a.vehName} · ${a.vanity}`, html };
}

/**
 * Avisa internamente cuando se adjudica una unidad.
 *
 * Dispara sobre la MISMA transición que sendAuctionWon (ended + sold +
 * winnerUid), así cubre tanto Compra ya como una subasta ganada por
 * vencimiento. Antes de esto nadie del lado interno se enteraba hasta que el
 * comprador subía el comprobante — y si nunca lo subía, nunca.
 *
 * NO dispara para outcome=sold_offline (venta de salón): esa transición
 * tiene status=ended pero outcome distinto de 'sold' y nunca setea
 * winnerUid, así que ambos guards de abajo la excluyen. Task 7 cubre el
 * aviso de esa venta por separado.
 *
 * Best-effort: la venta ya está escrita cuando esto corre; un correo caído
 * no puede tumbarla. Todo el trabajo que puede fallar (lecturas de
 * Firestore, envío) vive dentro del try/catch de abajo.
 */
export const sendAuctionSoldInternal = onDocumentUpdated(
  { document: 'auctions/{auctionId}', region: 'us-central1', secrets: [RESEND_API_KEY] },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    // Trigger only on the transition into ended+sold. Any subsequent write
    // to an already-sold auction (payment confirmed, forfeited, ...) must
    // not re-send.
    const wasSold = before['status'] === 'ended' && before['outcome'] === 'sold';
    const isSold = after['status'] === 'ended' && after['outcome'] === 'sold';
    if (wasSold || !isSold) return;

    const winnerUid = after['winnerUid'] as string | undefined;
    if (!winnerUid) return;

    try {
      const auctionId = event.params['auctionId'] as string;
      const uSnap = await adminDb().doc(`users/${winnerUid}`).get();
      const u = uSnap.data() ?? {};
      const profile = (u['profile'] ?? {}) as Record<string, unknown>;
      const v = (after['vehicleSnapshot'] ?? {}) as Record<string, unknown>;

      const deadline = after['paymentDeadline'] as Timestamp | undefined;
      const deadlineText = deadline
        ? deadline.toDate().toLocaleString('es-PY', {
            day: 'numeric',
            month: 'long',
            hour: '2-digit',
            minute: '2-digit',
          })
        : 'a confirmar';

      const docType = (profile['documentType'] as string) ?? '';
      const docNumber = (profile['documentNumber'] as string) ?? '';

      // Buy Now escribe un bid con source 'buy_now'; su ausencia significa
      // que se ganó pujando.
      const buyNowBidSnap = await adminDb()
        .collection(`auctions/${auctionId}/bids`)
        .where('source', '==', 'buy_now')
        .limit(1)
        .get();
      const viaBuyNow = !buyNowBidSnap.empty;

      const { subject, html } = buildInternalSoldEmail({
        vanity: `RNW-${auctionId.slice(-6).toUpperCase()}`,
        vehName:
          `${(v['make'] as string) ?? ''} ${(v['model'] as string) ?? ''} ${(v['year'] as number) ?? ''}`.trim(),
        finalPrice: (after['finalPrice'] as number) ?? 0,
        depositUsd: (after['paymentDepositUsd'] as number) ?? 0,
        deadlineText,
        buyerName:
          `${(profile['firstName'] as string) ?? ''} ${(profile['lastName'] as string) ?? ''}`.trim(),
        buyerEmail: (u['email'] as string) ?? '',
        buyerPhone: (profile['phone'] as string) ?? '',
        buyerDoc: docType && docNumber ? `${docType} ${docNumber}` : '',
        viaBuyNow,
      });

      // Administración fija + todo admin/staff activo.
      const staffSnap = await adminDb()
        .collection('users')
        .where('role', 'in', ['admin', 'staff'])
        .where('status', '==', 'active')
        .get();
      const recipients = Array.from(
        new Set([
          ADMIN_TO,
          ...staffSnap.docs
            .map((d) => d.data()['email'] as string | undefined)
            .filter((e): e is string => !!e),
        ]),
      );

      for (const to of recipients) {
        await sendEmail({ to, subject, html });
      }
    } catch (err) {
      console.error('[sendAuctionSoldInternal] failed (non-fatal)', err);
    }
  },
);
