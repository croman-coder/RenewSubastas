// Lee o configura la autenticación en dos pasos (MFA) del proyecto de
// Firebase Auth, sin consola.
//
//   node scripts/auth-mfa-config.mjs            # estado actual
//   node scripts/auth-mfa-config.mjs activar     # MFA opcional + proveedor TOTP (app autenticadora)
//   node scripts/auth-mfa-config.mjs desactivar   # rollback
//
// "activar" deja MFA en estado ENABLED (= los usuarios PUEDEN enrolar un
// segundo factor), nunca MANDATORY: Firebase no sabe de roles, y MANDATORY
// obligaría también a los compradores. La obligatoriedad para
// staff/admin/finanzas la impone la app (apps/web/src/lib/auth/mfa-gate.ts):
// sin segundo factor no hay cookie de sesión para esos roles.
//
// Sólo TOTP (Google Authenticator, Authy, 1Password…): sin SMS, que cuesta
// por mensaje y depende de que el número siga siendo del empleado.
//
// Requiere que el proyecto esté en Identity Platform. Si no lo está, la API
// responde con un error de precondición y no cambia nada.
import { readFileSync } from 'fs';

const mode = process.argv[2] ?? 'status';
const P = 'carbid-staging';

const cs = JSON.parse(
  readFileSync(`${process.env.HOME}/.config/configstore/firebase-tools.json`, 'utf8'),
);
const body = new URLSearchParams({
  grant_type: 'refresh_token',
  refresh_token: cs.tokens.refresh_token,
  client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
  client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
});
const { access_token } = await (
  await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body })
).json();
const H = { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' };
const url = `https://identitytoolkit.googleapis.com/admin/v2/projects/${P}/config`;

const show = async (label) => {
  const c = await (await fetch(url, { headers: H })).json();
  console.log(`${label}:`, JSON.stringify(c.mfa ?? {}));
  return c;
};

await show('antes');
if (mode === 'activar' || mode === 'desactivar') {
  const mfa =
    mode === 'activar'
      ? {
          state: 'ENABLED',
          providerConfigs: [{ state: 'ENABLED', totpProviderConfig: { adjacentIntervals: 5 } }],
        }
      : { state: 'DISABLED' };
  const r = await fetch(`${url}?updateMask=mfa`, {
    method: 'PATCH',
    headers: H,
    body: JSON.stringify({ mfa }),
  });
  if (!r.ok) {
    console.log('ERROR', r.status, JSON.stringify(await r.json()).slice(0, 500));
    process.exit(1);
  }
  await show('ahora');
  console.log('identidad:', cs.user?.email, '|', new Date().toISOString());
}
