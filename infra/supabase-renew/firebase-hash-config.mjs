// Imprime en stdout el signIn.hashConfig de Firebase Auth del proyecto
// (algorithm, signerKey, saltSeparator, rounds, memoryCost), en JSON.
//
//   node infra/supabase-renew/firebase-hash-config.mjs > hash.json   (con umask 077)
//
// Contiene la clave firmante del proyecto: redirigir SIEMPRE a un archivo
// privado, nunca a la terminal. Usa la sesión de `firebase login` de esta
// máquina (dueño del proyecto): la clave del Admin SDK no tiene permiso.
import { readFileSync } from 'fs';

const PROJECT = process.env.FIREBASE_PROJECT ?? 'carbid-staging';
const cs = JSON.parse(
  readFileSync(`${process.env.HOME}/.config/configstore/firebase-tools.json`, 'utf8'),
);
const { access_token } = await (
  await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: cs.tokens.refresh_token,
      // Cliente público del CLI de firebase-tools (lib/api.js), no un secreto.
      client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
      client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
    }),
  })
).json();
const r = await fetch(
  `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config`,
  {
    headers: { Authorization: `Bearer ${access_token}`, 'X-Goog-User-Project': PROJECT },
  },
);
const hc = (await r.json())?.signIn?.hashConfig;
if (!hc) {
  console.error(`sin hashConfig (HTTP ${r.status})`);
  process.exit(1);
}
process.stdout.write(JSON.stringify(hc));
