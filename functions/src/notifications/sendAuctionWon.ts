import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { adminDb } from '../lib/admin.js';
import { loadAppConfig } from '../lib/config.js';
import { sendEmail, RESEND_API_KEY } from '../lib/email.js';
import { recordNotification } from '../lib/notify.js';
import {
  emailShell,
  body,
  badge,
  heading,
  statPair,
  sectionLabel,
  dataRows,
  callout,
  ctaButton,
  SITE_URL,
} from '../lib/email-templates.js';

/**
 * Fires when an auction document transitions to status=ended,outcome=sold.
 * Sends the winner a congratulations email with the Santa Rosa bank
 * details, the deposit amount, and the formalisation deadline.
 *
 * Failure mode: we never throw. If the email channel is misconfigured
 * (Resend key missing, domain unverified) we log and keep going — the
 * winner can still see the same info in the in-app /[audience]/won/[id]
 * page, so a missing email isn't a hard block on the deal.
 */
export const sendAuctionWon = onDocumentUpdated(
  {
    document: 'auctions/{auctionId}',
    region: 'us-central1',
    secrets: [RESEND_API_KEY],
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    // Trigger only on the transition into a sold/ended state. Any
    // subsequent edit (admin marks paid, etc.) must not re-send.
    const wasEndedSold = before['status'] === 'ended' && before['outcome'] === 'sold';
    const isEndedSold = after['status'] === 'ended' && after['outcome'] === 'sold';
    if (wasEndedSold || !isEndedSold) return;

    const winnerUid = after['winnerUid'] as string | undefined;
    if (!winnerUid) return;

    const userSnap = await adminDb().doc(`users/${winnerUid}`).get();
    const userData = userSnap.data() ?? {};
    const email = userData['email'] as string | undefined;
    const profile = (userData['profile'] ?? {}) as Record<string, string>;
    const wantsEmail =
      (userData['preferences']?.notifications?.auctionWonEmail as boolean | undefined) ?? true;
    if (!email) {
      await recordNotification({
        type: 'auction_won',
        toUid: winnerUid,
        toEmail: '',
        auctionId: event.params['auctionId'] as string,
        result: { status: 'skipped', reason: 'no_email' },
      });
      return;
    }
    if (!wantsEmail) {
      await recordNotification({
        type: 'auction_won',
        toUid: winnerUid,
        toEmail: email,
        auctionId: event.params['auctionId'] as string,
        result: { status: 'skipped', reason: 'pref_off' },
      });
      return;
    }

    const cfg = await loadAppConfig();
    const p = cfg.payment;

    const v = (after['vehicleSnapshot'] ?? {}) as Record<string, unknown>;
    const finalPrice = (after['finalPrice'] as number) ?? 0;
    const depositUsd = (after['paymentDepositUsd'] as number) ?? finalPrice * p.depositPercent;
    const deadline = (after['paymentDeadline'] as { toDate?: () => Date } | undefined)?.toDate?.();

    const auctionId = event.params['auctionId'] as string;
    const audienceSeg = (userData['profile']?.audience as string) ?? 'retail';
    const wonUrl = `${SITE_URL}/es/${audienceSeg}/won/${auctionId}`;

    const fmtUsd = (n: number) =>
      n.toLocaleString('es-PY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtDate = deadline
      ? deadline.toLocaleString('es-PY', {
          timeZone: 'America/Asuncion',
          weekday: 'long',
          day: '2-digit',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : 'dentro de las próximas 24 horas';

    const bankRows: Array<[string, string]> = [];
    if (p.bankAccountHolder) bankRows.push(['Titular', p.bankAccountHolder]);
    if (p.bankName) bankRows.push(['Banco', p.bankName]);
    if (p.bankAccountType) bankRows.push(['Tipo de cuenta', p.bankAccountType]);
    if (p.bankAccountNumber) bankRows.push(['Número de cuenta', p.bankAccountNumber]);
    if (p.bankRuc) bankRows.push(['RUC', p.bankRuc]);

    const contactLine = [p.contactEmail, p.contactPhone].filter(Boolean).join(' · ');

    const html = emailShell(
      body(
        badge('Ganaste', 'success') +
          heading(
            `¡Felicitaciones, ${profile['firstName'] ?? ''}!`,
            `Ganaste la subasta del <strong style="color:#0a0a0a;">${v['make']} ${v['model']} ${v['year']}</strong>. Estás a un paso de cerrar la compra.`,
          ) +
          statPair(
            { label: 'Precio final', value: `USD ${fmtUsd(finalPrice)}` },
            {
              label: `Seña (${Math.round(p.depositPercent * 100)}%)`,
              value: `USD ${fmtUsd(depositUsd)}`,
              strong: true,
            },
          ) +
          sectionLabel('Datos para la seña') +
          (bankRows.length > 0
            ? dataRows(bankRows)
            : '<p style="margin:0;font-size:13px;color:#71717a;font-style:italic;">El administrador te contactará con los datos bancarios.</p>') +
          callout(
            `<strong>Plazo:</strong> tenés hasta el <strong>${fmtDate}</strong>. Si no recibimos el comprobante antes, la adjudicación se libera y el vehículo vuelve al catálogo.`,
            'warning',
          ) +
          (p.instructionsEs
            ? `<p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:#52525b;">${p.instructionsEs}</p>`
            : '') +
          ctaButton(wonUrl, 'Ver detalle e instrucciones') +
          (contactLine
            ? `<p style="margin:18px 0 0;font-size:12px;color:#a1a1aa;">¿Dudas? ${contactLine}</p>`
            : ''),
      ),
    );

    const result = await sendEmail({
      to: email,
      subject: `¡Ganaste la subasta! ${v['make']} ${v['model']} ${v['year']}`,
      html,
    });
    await recordNotification({
      type: 'auction_won',
      toUid: winnerUid,
      toEmail: email,
      auctionId,
      result,
    });
  },
);
