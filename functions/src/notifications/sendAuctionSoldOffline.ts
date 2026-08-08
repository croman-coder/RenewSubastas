import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { adminDb } from '../lib/admin.js';
import {
  sendEmail,
  RESEND_API_KEY,
  type SendEmailArgs,
  type SendEmailResult,
} from '../lib/email.js';
import { recordNotification } from '../lib/notify.js';
import { emailShell, body, badge, heading, callout, esc } from '../lib/email-templates.js';

/**
 * Arma el correo. Separado del trigger para poder testear el contenido sin
 * emulador de Firestore ni red — mismo motivo que buildInternalSoldEmail en
 * ./sendAuctionSoldInternal.ts.
 *
 * bidderFirstName y vehName vienen de datos cargados por un usuario (perfil
 * del postor, make/model del vehículo) así que ambos pasan por esc() antes
 * de interpolarse en el HTML. El `<strong>` que envuelve a vehName es
 * markup estático de este archivo, no del postor, así que no se escapa.
 */
export function buildSoldOfflineEmail({
  vehName,
  bidderFirstName,
}: {
  vehName: string;
  bidderFirstName: string;
}): { subject: string; html: string } {
  const html = emailShell(
    body(
      badge('Subasta finalizada', 'neutral') +
        heading(
          `Hola, ${esc(bidderFirstName)}`,
          `La unidad <strong style="color:#0a0a0a;">${esc(vehName)}</strong> por la que habías pujado se vendió en nuestro salón, así que la subasta se cerró antes de tiempo.`,
        ) +
        callout(
          'Lamentamos el inconveniente. Tu puja no genera ningún cargo. Seguí atento: publicamos lotes nuevos con frecuencia.',
          'neutral',
        ),
    ),
  );
  // El subject es texto plano, no HTML — escapar acá produciría un "&amp;"
  // literal en la bandeja de entrada, así que vehName va sin esc().
  return { subject: `Subasta finalizada · ${vehName}`, html };
}

export interface AuctionSoldOfflineEvent {
  auctionId: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

/**
 * Mismo seam de inyección que Deps en ./sendAuctionSoldInternal.ts: por
 * defecto pega al sendEmail real, así que producción no cambia. Los tests
 * pasan un recorder que igual DELEGA al sendEmail real por debajo — el seam
 * sólo agrega un punto de observación, no simula comportamiento.
 */
interface Deps {
  send: (args: SendEmailArgs) => Promise<SendEmailResult>;
}

/**
 * Guardia de transición + fan-out a cada postor histórico de la subasta.
 * Extraído del trigger para poder testearlo contra el emulador real con
 * fixtures antes/después reales, sin pasar por onDocumentUpdated — mismo
 * shape que handleAuctionSoldInternal en ./sendAuctionSoldInternal.ts y
 * handleBidOutbid en ./sendBidOutbid.ts.
 *
 * Dispara SOLO sobre la transición hacia ended+sold_offline (mira `before`
 * además de `after`, igual que handleAuctionSoldInternal), así una
 * escritura posterior sobre una subasta ya sold_offline no reenvía el
 * correo. No dispara para 'sold' (subasta ganada — la cubre
 * sendAuctionWon), ni para 'reserve_not_met' / 'no_bids' / 'cancelled'.
 *
 * A diferencia de handleAuctionSoldInternal (un único winnerUid), acá se
 * itera CADA postor histórico leyendo la subcolección bids sin filtrar por
 * status: markSoldOffline ya volteó todo bid 'winning' a 'outbid' en la
 * misma transacción que escribió sold_offline, así que para cuando este
 * trigger corre no queda ningún bid 'winning' que buscar — todos, ganador
 * incluido, son simplemente "alguien que pujó por una unidad que ya no está
 * disponible".
 *
 * Best-effort por postor, no sólo en general: cada postor (lectura de su
 * perfil, armado del correo, envío, y su propio recordNotification) va en
 * su propio try/catch DENTRO del loop — no uno solo envolviendo el loop
 * entero — para que una falla puntual (perfil ilegible, escritura de
 * notifications que rechaza) no aborte la iteración y silencie a los
 * postores que todavía no fueron procesados.
 *
 * Privacidad: cada postor recibe un `to` individual — nunca un array con
 * todos los destinatarios — y el cuerpo de SU correo sólo lleva SU nombre;
 * nunca el de otro postor, nunca ningún monto, nunca reservePrice (vive en
 * auctions/{id}/private/internal, jamás leído acá) ni soldOfflinePriceUsd
 * (dato interno de reporting, no algo que se le deba a un postor que
 * perdió).
 */
export async function handleAuctionSoldOffline(
  e: AuctionSoldOfflineEvent,
  deps: Deps = { send: sendEmail },
): Promise<void> {
  const { auctionId, before, after } = e;

  const wasOffline = before['status'] === 'ended' && before['outcome'] === 'sold_offline';
  const isOffline = after['status'] === 'ended' && after['outcome'] === 'sold_offline';
  if (wasOffline || !isOffline) return;

  const v = (after['vehicleSnapshot'] ?? {}) as Record<string, unknown>;
  const vehName =
    `${(v['make'] as string) ?? ''} ${(v['model'] as string) ?? ''} ${(v['year'] as number) ?? ''}`.trim();

  let uids: string[];
  try {
    const bidsSnap = await adminDb().collection(`auctions/${auctionId}/bids`).get();
    uids = Array.from(
      new Set(
        bidsSnap.docs
          .map((d) => d.data()['buyerUid'] as string | undefined)
          .filter((u): u is string => !!u),
      ),
    );
  } catch (err) {
    // Sin la lista de postores no hay a quién escribirle — a diferencia del
    // loop de abajo, acá no hay nada que aislar.
    console.error('[sendAuctionSoldOffline] failed to list bidders (non-fatal)', auctionId, err);
    return;
  }

  for (const uid of uids) {
    try {
      const uSnap = await adminDb().doc(`users/${uid}`).get();
      const u = uSnap.data() ?? {};
      const email = u['email'] as string | undefined;
      if (!email) continue;
      const profile = (u['profile'] ?? {}) as Record<string, unknown>;
      const { subject, html } = buildSoldOfflineEmail({
        vehName,
        bidderFirstName: (profile['firstName'] as string) ?? '',
      });
      const result = await deps.send({ to: email, subject, html });
      await recordNotification({
        type: 'auction_sold_offline',
        toUid: uid,
        toEmail: email,
        auctionId,
        bidId: null,
        result,
      });
    } catch (err) {
      console.error('[sendAuctionSoldOffline] failed for bidder (non-fatal)', uid, err);
    }
  }
}

/**
 * Avisa a quienes habían pujado cuando la unidad se vendió en salón. Ver el
 * docblock de handleAuctionSoldOffline para el contrato completo — este
 * wrapper sólo extrae el evento de Firestore y delega, mismo shape que
 * sendAuctionSoldInternal / sendBidOutbid.
 */
export const sendAuctionSoldOffline = onDocumentUpdated(
  { document: 'auctions/{auctionId}', region: 'us-central1', secrets: [RESEND_API_KEY] },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;
    await handleAuctionSoldOffline({
      auctionId: event.params['auctionId'] as string,
      before,
      after,
    });
  },
);
