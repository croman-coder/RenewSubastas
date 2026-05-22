import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { adminDb } from '../lib/admin.js';
import { loadAppConfig } from '../lib/config.js';
import { sendEmail, RESEND_API_KEY } from '../lib/email.js';

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
    if (!email || !wantsEmail) return;

    const cfg = await loadAppConfig();
    const p = cfg.payment;

    const v = (after['vehicleSnapshot'] ?? {}) as Record<string, unknown>;
    const finalPrice = (after['finalPrice'] as number) ?? 0;
    const depositUsd = (after['paymentDepositUsd'] as number) ?? finalPrice * p.depositPercent;
    const deadline = (after['paymentDeadline'] as { toDate?: () => Date } | undefined)?.toDate?.();

    const auctionId = event.params['auctionId'] as string;
    const wonUrl = `https://santarosa.com.py/es/${(userData['profile']?.audience as string) ?? 'retail'}/won/${auctionId}`;

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

    const bankBlock =
      p.bankAccountHolder || p.bankName
        ? `<table cellpadding="6" style="border-collapse:collapse;margin:12px 0;font-size:14px;">
            ${p.bankAccountHolder ? `<tr><td><b>Titular</b></td><td>${p.bankAccountHolder}</td></tr>` : ''}
            ${p.bankName ? `<tr><td><b>Banco</b></td><td>${p.bankName}</td></tr>` : ''}
            ${p.bankAccountType ? `<tr><td><b>Tipo de cuenta</b></td><td>${p.bankAccountType}</td></tr>` : ''}
            ${p.bankAccountNumber ? `<tr><td><b>Número de cuenta</b></td><td>${p.bankAccountNumber}</td></tr>` : ''}
            ${p.bankRuc ? `<tr><td><b>RUC</b></td><td>${p.bankRuc}</td></tr>` : ''}
          </table>`
        : '<p><i>El administrador te contactará con los datos bancarios.</i></p>';

    const contactLine = [p.contactEmail, p.contactPhone].filter(Boolean).join(' · ');

    await sendEmail({
      to: email,
      subject: `¡Ganaste la subasta! ${v['make']} ${v['model']} ${v['year']}`,
      html: `
        <div style="font-family:Inter,system-ui,sans-serif;max-width:560px;color:#111;">
          <h1 style="font-size:22px;margin:0 0 8px;">¡Felicitaciones, ${profile['firstName'] ?? ''}!</h1>
          <p style="font-size:15px;line-height:1.5;margin:0 0 16px;">
            Ganaste la subasta del <b>${v['make']} ${v['model']} ${v['year']}</b> por
            <b>USD ${fmtUsd(finalPrice)}</b>.
          </p>

          <h2 style="font-size:16px;margin:20px 0 6px;">Próximo paso · seña</h2>
          <p style="font-size:14px;line-height:1.5;margin:0 0 4px;">
            Para formalizar la compra, transferí la seña de
            <b>USD ${fmtUsd(depositUsd)}</b>
            (${Math.round(p.depositPercent * 100)}% del precio final) a la siguiente cuenta:
          </p>
          ${bankBlock}

          <p style="font-size:14px;line-height:1.5;margin:0 0 4px;">
            <b>Plazo:</b> tenés hasta el <b>${fmtDate}</b>.
            Si no recibimos el comprobante antes de ese momento, la adjudicación
            se libera y el vehículo vuelve al catálogo.
          </p>
          ${p.instructionsEs ? `<p style="font-size:13px;line-height:1.5;color:#444;margin:12px 0;">${p.instructionsEs}</p>` : ''}

          <p style="font-size:14px;margin:18px 0 0;">
            <a href="${wonUrl}" style="background:#111;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;display:inline-block;">
              Ver detalle e instrucciones
            </a>
          </p>

          ${contactLine ? `<p style="font-size:12px;color:#666;margin:24px 0 0;">¿Dudas? Contactanos: ${contactLine}</p>` : ''}
          <p style="font-size:12px;color:#999;margin:16px 0 0;">— Renew Subastas · Santa Rosa Automotores</p>
        </div>
      `,
    });
  },
);
