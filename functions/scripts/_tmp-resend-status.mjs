// READ-ONLY: Resend delivery status for given email ids. Reads RESEND_API_KEY
// from Secret Manager with the firebase CLI login; the key never leaves memory.
import { readFileSync } from 'fs';
const ids = process.argv.slice(2);
const cs = JSON.parse(readFileSync(`${process.env.HOME}/.config/configstore/firebase-tools.json`, 'utf8'));
const body = new URLSearchParams({
  grant_type: 'refresh_token',
  refresh_token: cs.tokens.refresh_token,
  client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
  client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
});
const { access_token } = await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body })).json();
const sec = await (
  await fetch('https://secretmanager.googleapis.com/v1/projects/carbid-staging/secrets/RESEND_API_KEY/versions/latest:access', {
    headers: { Authorization: `Bearer ${access_token}` },
  })
).json();
if (!sec.payload?.data) {
  console.log('no pude leer el secreto:', JSON.stringify(sec).slice(0, 200));
  process.exit(1);
}
const key = Buffer.from(sec.payload.data, 'base64').toString('utf8').trim();

for (const id of ids) {
  const r = await fetch(`https://api.resend.com/emails/${id}`, { headers: { Authorization: `Bearer ${key}` } });
  const j = await r.json();
  if (!r.ok || !j.to) { console.log(`${id.slice(0, 8)}… → HTTP ${r.status}: ${JSON.stringify(j).slice(0, 200)}`); continue; }
  console.log(
    `${id.slice(0, 8)}… → to=${j.to?.join(',')} from=${j.from} last_event=${j.last_event} created=${j.created_at} ${j.error ? 'ERR ' + JSON.stringify(j.error) : ''}`,
  );
}
// Domain verification state — a common reason for silent non-delivery.
const d = await (await fetch('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${key}` } })).json();
for (const dom of d.data ?? []) console.log(`dominio ${dom.name}: ${dom.status} (region ${dom.region})`);
process.exit(0);
