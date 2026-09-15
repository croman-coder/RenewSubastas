// Lee o cambia el modo de App Check de un servicio de Firebase, sin consola.
//
//   node scripts/appcheck-enforcement.mjs                       # estado de los tres
//   node scripts/appcheck-enforcement.mjs firestore.googleapis.com ENFORCED
//   node scripts/appcheck-enforcement.mjs firestore.googleapis.com UNENFORCED   # rollback
//
// Servicios: firestore.googleapis.com · firebasestorage.googleapis.com ·
// identitytoolkit.googleapis.com (Auth — dejarlo UNENFORCED: forzado,
// quien no pase reCAPTCHA no puede ni iniciar sesión).
//
// Usa la sesión de `firebase login` de esta máquina (el dueño del proyecto),
// no la clave del Admin SDK: esa clave no tiene permiso sobre App Check
// (comprobado, 403). El client_id/secret son los públicos del CLI de
// firebase-tools (lib/api.js del paquete open source), no un secreto.
//
// Historial: Firestore pasó a ENFORCED el 2026-09-15 17:05 UTC. Storage ya
// estaba ENFORCED. Antes de forzar cualquiera, comprobar que el cliente
// desplegado inicializa App Check (NEXT_PUBLIC_RECAPTCHA_SITE_KEY en
// Netlify + badge de reCAPTCHA visible en producción): sin token, forzar
// deja a TODOS los usuarios afuera con "Missing or insufficient permissions".
import { readFileSync } from 'fs';
const [service, mode] = process.argv.slice(2);
if (service && !['ENFORCED', 'UNENFORCED'].includes(mode)) {
  console.error('uso: [servicio ENFORCED|UNENFORCED]  (sin argumentos: muestra el estado)');
  process.exit(2);
}
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
if (!service) {
  const all = await (
    await fetch('https://firebaseappcheck.googleapis.com/v1/projects/carbid-staging/services', {
      headers: H,
    })
  ).json();
  for (const s of all.services ?? [])
    console.log(s.name.split('/').pop().padEnd(36), s.enforcementMode);
  process.exit(0);
}
const base = `https://firebaseappcheck.googleapis.com/v1/projects/carbid-staging/services/${service}`;
const before = await (await fetch(base, { headers: H })).json();
console.log('antes :', before.enforcementMode);
const r = await fetch(`${base}?updateMask=enforcementMode`, {
  method: 'PATCH',
  headers: H,
  body: JSON.stringify({ enforcementMode: mode }),
});
const j = await r.json();
if (!r.ok) {
  console.log('ERROR', r.status, JSON.stringify(j).slice(0, 300));
  process.exit(1);
}
const after = await (await fetch(base, { headers: H })).json();
console.log(
  'ahora :',
  after.enforcementMode,
  '| identidad:',
  cs.user?.email,
  '|',
  new Date().toISOString(),
);
