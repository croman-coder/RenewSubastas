// One-shot: render every transactional email with the REAL shared template
// builders (production design) and send to a test inbox via Resend.
// Not committed. Run:
//   RESEND_API_KEY=re_xxx TEST_TO=croman@santarosa.com.py node scripts/send-test-emails.mjs
import {
  emailShell,
  body,
  badge,
  heading,
  statPair,
  sectionLabel,
  dataRows,
  ctaButton,
  callout,
  SITE_URL,
} from '../lib/lib/email-templates.js';

const KEY = process.env.RESEND_API_KEY;
const TO = process.env.TEST_TO || process.argv[2] || 'croman@santarosa.com.py';
const FROM = 'Renew Subastas <noreply@renewsubastas.com.py>';
if (!KEY) {
  console.error('RESEND_API_KEY missing');
  process.exit(1);
}
const link = (p) => `${SITE_URL}${p}`;

const emails = [
  {
    subject: '[PRUEBA] ¡Bienvenido a Renew Subastas! Creá tu contraseña',
    html: emailShell(
      body(
        badge('Cuenta creada', 'neutral') +
          heading(
            '¡Bienvenido, Carlos!',
            'Tu cuenta en <strong style="color:#0a0a0a;">Renew Subastas</strong> está lista. Tipo de cuenta: <strong style="color:#0a0a0a;">Retail (público general)</strong>.',
          ) +
          callout(
            'Para entrar, primero creá tu contraseña con el botón de abajo. El enlace es personal, no lo compartas.',
            'info',
          ) +
          ctaButton(link('/es/auth/set-password?token=DEMO'), 'Crear mi contraseña'),
      ),
    ),
  },
  {
    subject: '[PRUEBA] Restablecé tu contraseña · Renew Subastas',
    html: emailShell(
      body(
        badge('Restablecer contraseña', 'info') +
          heading(
            'Hola, Carlos',
            'Recibimos un pedido para restablecer la contraseña de tu cuenta en <strong style="color:#0a0a0a;">Renew Subastas</strong>.',
          ) +
          callout(
            'Si no pediste esto, ignorá este correo: tu contraseña actual sigue funcionando. El enlace es personal y de un solo uso.',
            'warning',
          ) +
          ctaButton(link('/es/auth/set-password?token=DEMO'), 'Crear nueva contraseña'),
      ),
    ),
  },
  {
    subject: '[PRUEBA] Te superaron · Toyota Hilux 2022',
    html: emailShell(
      body(
        badge('Te superaron', 'warning') +
          heading(
            'Te superaron en Toyota Hilux 2022',
            'Otra persona ofertó más que vos. Todavía estás a tiempo de recuperar la punta.',
          ) +
          statPair(
            { label: 'Tu oferta', value: 'USD 18.000,00' },
            { label: 'Oferta líder', value: 'USD 18.500,00', strong: true },
          ) +
          ctaButton(link('/es/auctions/DEMO'), 'Volver a pujar'),
      ),
    ),
  },
  {
    subject: '[PRUEBA] ¡Ganaste la subasta! Toyota Hilux 2022',
    html: emailShell(
      body(
        badge('¡Ganaste!', 'success') +
          heading(
            '¡Felicitaciones, Carlos!',
            'Te adjudicaste el <strong style="color:#0a0a0a;">Toyota Hilux 2022</strong>. Asegurá la unidad pagando la seña antes del plazo.',
          ) +
          statPair(
            { label: 'Precio final', value: 'USD 18.500,00', strong: true },
            { label: 'Seña a pagar', value: 'USD 1.850,00' },
          ) +
          sectionLabel('Datos para la transferencia') +
          dataRows([
            ['Banco', 'Banco Itaú Paraguay'],
            ['Titular', 'Santa Rosa Automotores S.A.'],
            ['Cuenta', '000-000000-0'],
            ['Plazo', '48 horas'],
          ]) +
          callout(
            'Subí el comprobante desde tu página de ganador apenas transfieras. Si no pagás antes del plazo, perdés la reserva.',
            'warning',
          ) +
          ctaButton(link('/es/retail/won/DEMO'), 'Ir a mi página de ganador'),
      ),
    ),
  },
  {
    subject: '[PRUEBA] Comprobante RNW-DEMO01 · Toyota Hilux · Carlos R.',
    html: emailShell(
      body(
        badge('Comprobante recibido', 'info') +
          heading(
            'Nuevo comprobante de seña',
            'El ganador subió su comprobante. Revisá los datos y confirmá o liberá la seña.',
          ) +
          sectionLabel('Vehículo') +
          dataRows([
            ['Vehículo', 'Toyota Hilux 2022'],
            ['Chapa', 'ABC 123'],
            ['VIN', '8AJ...DEMO'],
          ]) +
          sectionLabel('Comprador') +
          dataRows([
            ['Nombre', 'Carlos Román'],
            ['Email', 'croman@santarosa.com.py'],
            ['Teléfono', '+595 981 000000'],
          ]) +
          statPair(
            { label: 'Precio final', value: 'USD 18.500,00' },
            { label: 'Seña esperada', value: 'USD 1.850,00', strong: true },
          ) +
          ctaButton(link('/es/staff/auctions/DEMO'), 'Abrir en el panel'),
      ),
    ),
  },
];

let ok = 0;
for (const e of emails) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: TO, subject: e.subject, html: e.html }),
  });
  const j = await res.json().catch(() => ({}));
  console.log(`${res.status}  ${e.subject}  -> ${j.id ?? JSON.stringify(j)}`);
  if (res.ok) ok += 1;
}
console.log(`\n${ok}/${emails.length} enviados a ${TO}`);
