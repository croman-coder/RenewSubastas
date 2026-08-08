import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '../lib/admin.js';
import {
  sendEmail,
  RESEND_API_KEY,
  type SendEmailArgs,
  type SendEmailResult,
} from '../lib/email.js';
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

export interface AuctionSoldInternalEvent {
  auctionId: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

/**
 * Injection seam for the outbound send, same shape as `runDailyUnsoldDigest`'s
 * `Deps` in `insights/dailyUnsoldDigest.ts` — the closest existing precedent
 * for "broadcast email, no per-recipient Firestore record to observe".
 * Defaults to the real `sendEmail`, so production is unaffected; tests pass a
 * thin recorder that still DELEGATES to the real `sendEmail` underneath (see
 * the test file), so the real no-API-key-skip codepath keeps running for
 * real — this only adds an observation point, it doesn't fake behaviour.
 */
interface Deps {
  send: (args: SendEmailArgs) => Promise<SendEmailResult>;
}

/**
 * Reads the winner + vehicle + buy-now-or-not data and renders the email.
 * Returns null (and logs) on any read failure — with no content built there
 * is nothing to send to anyone, so this is the one case where "failing the
 * email entirely" is the only option.
 */
async function buildEmailContent(
  auctionId: string,
  winnerUid: string,
  after: Record<string, unknown>,
): Promise<{ subject: string; html: string } | null> {
  try {
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

    return buildInternalSoldEmail({
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
  } catch (err) {
    console.error('[sendAuctionSoldInternal] failed to build email (non-fatal)', err);
    return null;
  }
}

/**
 * Guardia de transición + armado + envío. Extraído del trigger para poder
 * testearlo contra el emulador real con fixtures antes/después reales, sin
 * pasar por onDocumentUpdated — mismo shape que handleBidOutbid en
 * sendBidOutbid.ts.
 *
 * Dispara sobre la MISMA transición que sendAuctionWon (ended + sold +
 * winnerUid), así cubre tanto Compra ya como una subasta ganada por
 * vencimiento con un único trigger, sin branch para buy-now: ambos caminos
 * escriben esa transición a través del mismo closeAuctionAsSold.
 *
 * NO dispara para outcome=sold_offline (venta de salón): esa transición
 * tiene status=ended pero outcome distinto de 'sold' y nunca setea
 * winnerUid, así que ambos guards de abajo la excluyen. Task 7 cubre el
 * aviso de esa venta por separado.
 *
 * Sólo dispara en la TRANSICIÓN hacia ended+sold — mira `before` además de
 * `after` — así que una escritura posterior sobre una subasta ya vendida
 * (pago confirmado, forfeited por vencimiento) no reenvía el correo.
 *
 * Best-effort en cada tramo, no sólo en general: construir el contenido,
 * mandar a ADMIN_TO, y mandar al resto del staff son tres bloques
 * protegidos de forma independiente. En particular, un fallo en la consulta
 * de staff (abajo) NO debe impedir el envío a ADMIN_TO — es el único
 * destinatario que se supone incondicional.
 */
export async function handleAuctionSoldInternal(
  e: AuctionSoldInternalEvent,
  deps: Deps = { send: sendEmail },
): Promise<void> {
  const { auctionId, before, after } = e;

  const wasSold = before['status'] === 'ended' && before['outcome'] === 'sold';
  const isSold = after['status'] === 'ended' && after['outcome'] === 'sold';
  if (wasSold || !isSold) return;

  const winnerUid = after['winnerUid'] as string | undefined;
  if (!winnerUid) return;

  const built = await buildEmailContent(auctionId, winnerUid, after);
  if (!built) return;
  const { subject, html } = built;

  // ADMIN_TO es incondicional: se manda independientemente de si la
  // consulta de staff de abajo funciona, para que un hiccup de Firestore
  // ahí no silencie el único aviso garantizado.
  try {
    await deps.send({ to: ADMIN_TO, subject, html });
  } catch (err) {
    console.error('[sendAuctionSoldInternal] admin send failed (non-fatal)', err);
  }

  try {
    const staffSnap = await adminDb()
      .collection('users')
      .where('role', 'in', ['admin', 'staff'])
      .where('status', '==', 'active')
      .get();
    const extra = Array.from(
      new Set(
        staffSnap.docs
          .map((d) => d.data()['email'] as string | undefined)
          .filter((em): em is string => !!em),
      ),
    ).filter((email) => email !== ADMIN_TO);

    for (const to of extra) {
      await deps.send({ to, subject, html });
    }
  } catch (err) {
    console.error('[sendAuctionSoldInternal] staff recipients failed (non-fatal)', err);
  }
}

/**
 * Avisa internamente cuando se adjudica una unidad. Ver el docblock de
 * handleAuctionSoldInternal para el contrato completo — este wrapper sólo
 * extrae el evento de Firestore y delega.
 */
export const sendAuctionSoldInternal = onDocumentUpdated(
  { document: 'auctions/{auctionId}', region: 'us-central1', secrets: [RESEND_API_KEY] },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;
    await handleAuctionSoldInternal({
      auctionId: event.params['auctionId'] as string,
      before,
      after,
    });
  },
);
