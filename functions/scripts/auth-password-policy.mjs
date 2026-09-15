// Lee o aplica la política de contraseña del proyecto de Firebase Auth, sin
// consola.
//
//   node scripts/auth-password-policy.mjs          # estado actual
//   node scripts/auth-password-policy.mjs apply    # aplicar la regla de abajo
//   node scripts/auth-password-policy.mjs off      # desactivar (rollback)
//
// La regla es LA MISMA que PasswordSchema en @carbid/shared-types y que el
// chequeo de redeemPasswordReset: 10+ caracteres, una minúscula, un número.
// Las tres tienen que coincidir o un usuario recibe un mensaje de un lado y
// un rechazo del otro. Si cambiás una, cambiá las tres.
//
// forceUpgradeOnSignin queda en false a propósito: en true, a los usuarios
// con contraseña vieja que no cumpla Firebase les rechaza el login con
// auth/password-does-not-meet-requirements hasta que la cambien — y el
// formulario de login de hoy no maneja ese código, así que verían "Error al
// iniciar sesión" sin salida. Activarlo requiere primero un flujo de
// "actualizá tu contraseña" en el login. Con false, la política aplica a
// contraseñas nuevas y cambios; las existentes siguen entrando.
//
// Usa la sesión de `firebase login` (dueño del proyecto): la clave del Admin
// SDK no tiene permiso sobre la configuración de Identity Toolkit.
import { readFileSync } from 'fs';

const mode = process.argv[2] ?? 'status';
const P = 'carbid-staging';

const POLICY = {
  passwordPolicyEnforcementState: 'ENFORCE',
  forceUpgradeOnSignin: false,
  passwordPolicyVersions: [
    {
      customStrengthOptions: {
        minPasswordLength: 10,
        containsLowercaseCharacter: true,
        containsNumericCharacter: true,
      },
    },
  ],
};

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
  console.log(`${label}:`, JSON.stringify(c.passwordPolicyConfig ?? {}));
};

await show('antes');
if (mode === 'apply' || mode === 'off') {
  const patch =
    mode === 'apply'
      ? POLICY
      : { passwordPolicyEnforcementState: 'OFF', forceUpgradeOnSignin: false };
  const r = await fetch(`${url}?updateMask=passwordPolicyConfig`, {
    method: 'PATCH',
    headers: H,
    body: JSON.stringify({ passwordPolicyConfig: patch }),
  });
  if (!r.ok) {
    console.log('ERROR', r.status, JSON.stringify(await r.json()).slice(0, 400));
    process.exit(1);
  }
  await show('ahora');
  console.log('identidad:', cs.user?.email, '|', new Date().toISOString());
}
