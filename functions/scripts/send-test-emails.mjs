// Sends two test transactional emails (won + outbid) to a target address
// using the Resend onboarding sender (works without domain verification,
// but Resend only delivers to the account-owner email until the domain
// is verified).
//
// Usage:
//   RESEND_API_KEY=re_xxx node scripts/send-test-emails.mjs croman@santarosa.com.py
//
// Professional HTML matching the Renew B&W identity, with the hosted
// wordmark PNG (email clients can't render CSS masks, so we use the
// black wordmark on the white email canvas).

import { Resend } from '/home/croman/Escritorio/CARBID/functions/node_modules/resend/dist/index.mjs';

const KEY = process.env.RESEND_API_KEY;
const TO = process.argv[2];
if (!KEY || !TO) {
  console.error('Usage: RESEND_API_KEY=re_xxx node send-test-emails.mjs <to-email>');
  process.exit(1);
}
const resend = new Resend(KEY);

const LOGO = 'https://renewsubastas.netlify.app/brand/renew-wordmark-black.png';
const FROM = 'Renew Subastas <onboarding@resend.dev>';
const fmtUsd = (n) => n.toLocaleString('es-PY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Shared shell: white canvas, centered 560px card, ink type, hosted logo.
function shell(inner) {
  return `
  <div style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
      <div style="background:#ffffff;border:1px solid #e4e4e7;border-radius:16px;overflow:hidden;">
        <div style="padding:28px 32px 0;">
          <img src="${LOGO}" alt="Renew Subastas" height="26" style="display:block;height:26px;width:auto;" />
        </div>
        ${inner}
        <div style="padding:20px 32px 28px;border-top:1px solid #f0f0f0;margin-top:8px;">
          <p style="margin:0;font-size:11px;color:#a1a1aa;">
            Renew Subastas · Santa Rosa Automotores · Paraguay
          </p>
        </div>
      </div>
    </div>
  </div>`;
}

function statTile(label, value, strong = false) {
  return `
    <td style="padding:0 6px;" width="50%">
      <div style="background:${strong ? '#0f0f0f' : '#f5f5f5'};border-radius:12px;padding:14px 16px;">
        <div style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:${strong ? '#a1a1aa' : '#71717a'};font-weight:600;">${label}</div>
        <div style="font-size:22px;font-weight:700;color:${strong ? '#ffffff' : '#0f0f0f'};margin-top:4px;">${value}</div>
      </div>
    </td>`;
}

function button(href, text) {
  return `
    <a href="${href}" style="display:inline-block;background:#0f0f0f;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:10px;">
      ${text}
    </a>`;
}

const wonHtml = shell(`
  <div style="padding:24px 32px 8px;">
    <div style="display:inline-block;background:#dcfce7;color:#166534;font-size:11px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;padding:4px 10px;border-radius:999px;">
      Ganaste
    </div>
    <h1 style="margin:14px 0 4px;font-size:26px;line-height:1.2;color:#0f0f0f;font-weight:800;">
      ¡Felicitaciones, Carlos!
    </h1>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.55;color:#52525b;">
      Ganaste la subasta del <strong style="color:#0f0f0f;">Toyota Corolla 2026</strong>.
      Estás a un paso de cerrar la compra.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;"><tr>
      ${statTile('Precio final', 'USD ' + fmtUsd(16500), false)}
      ${statTile('Seña (10%)', 'USD ' + fmtUsd(1650), true)}
    </tr></table>

    <h2 style="margin:18px 0 8px;font-size:14px;color:#0f0f0f;font-weight:700;">Datos para la seña</h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#3f3f46;border-collapse:collapse;">
      <tr><td style="padding:6px 0;color:#71717a;width:130px;">Titular</td><td style="padding:6px 0;font-weight:600;">Santa Rosa Automotores S.A.</td></tr>
      <tr><td style="padding:6px 0;color:#71717a;">Banco</td><td style="padding:6px 0;font-weight:600;">Banco Itaú Paraguay</td></tr>
      <tr><td style="padding:6px 0;color:#71717a;">Cuenta</td><td style="padding:6px 0;font-weight:600;">000-000000-0</td></tr>
      <tr><td style="padding:6px 0;color:#71717a;">RUC</td><td style="padding:6px 0;font-weight:600;">80012345-6</td></tr>
    </table>

    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px 14px;margin:16px 0;">
      <p style="margin:0;font-size:13px;color:#92400e;">
        <strong>Plazo:</strong> tenés <strong>24 horas</strong> para enviar el comprobante.
        Pasado ese tiempo, la adjudicación se libera y el vehículo vuelve al catálogo.
      </p>
    </div>

    <div style="margin:8px 0 4px;">${button('https://renewsubastas.netlify.app/es/wholesale/won', 'Ver detalle e instrucciones')}</div>
  </div>
`);

const outbidHtml = shell(`
  <div style="padding:24px 32px 8px;">
    <div style="display:inline-block;background:#fee2e2;color:#991b1b;font-size:11px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;padding:4px 10px;border-radius:999px;">
      Te superaron
    </div>
    <h1 style="margin:14px 0 4px;font-size:26px;line-height:1.2;color:#0f0f0f;font-weight:800;">
      Otro postor tomó la delantera
    </h1>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.55;color:#52525b;">
      Tu puja en el <strong style="color:#0f0f0f;">Toyota Corolla 2026</strong> fue superada.
      Todavía estás a tiempo de recuperar la punta.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;"><tr>
      ${statTile('Tu puja', 'USD ' + fmtUsd(16500), false)}
      ${statTile('Puja actual', 'USD ' + fmtUsd(17000), true)}
    </tr></table>

    <p style="margin:0 0 16px;font-size:13px;color:#71717a;">
      Incremento mínimo: USD 500. La subasta sigue en vivo.
    </p>

    <div style="margin:8px 0 4px;">${button('https://renewsubastas.netlify.app/es/auctions', 'Volver a pujar')}</div>
  </div>
`);

async function send(subject, html) {
  const r = await resend.emails.send({ from: FROM, to: TO, subject, html });
  if (r.error) console.error('REJECTED:', subject, '->', r.error);
  else console.log('SENT:', subject, '| id', r.data?.id);
}

await send('¡Ganaste la subasta! Toyota Corolla 2026', wonHtml);
await send('Te superaron en una subasta · Toyota Corolla 2026', outbidHtml);
console.log('\nIf both SENT but nothing arrives: Resend onboarding only delivers to the Resend account-owner email until santarosa.com.py is verified.');
process.exit(0);
