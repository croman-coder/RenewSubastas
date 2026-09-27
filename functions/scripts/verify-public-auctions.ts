// Comprobaciones de punta a punta de las páginas públicas de subasta, SOLO
// contra los EMULADORES.
//
//   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
//   GCLOUD_PROJECT=carbid-staging pnpm exec tsx scripts/verify-public-auctions.ts
//
// Hace falta: los emuladores arriba con seed-demo-video cargado, y `next start -p 3016`
// de apps/web corriendo con las mismas variables de emulador.
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

if (!process.env['FIRESTORE_EMULATOR_HOST']) {
  console.error('REFUSING TO RUN: FIRESTORE_EMULATOR_HOST is not set.');
  process.exit(1);
}

const BASE = 'http://localhost:3016';
initializeApp({ projectId: process.env['GCLOUD_PROJECT'] ?? 'carbid-staging' });
const db = getFirestore();
let failures = 0;
const check = (ok: boolean, label: string, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};
const get = (path: string, cookie?: string) =>
  fetch(BASE + path, {
    redirect: 'manual',
    headers: cookie ? { cookie: `__session=${cookie}` } : {},
  });

async function main() {
  const live = await get('/es/auctions/demo-auction-3');
  const html = await live.text();
  check(live.status === 200, 'ficha en vivo abre sin cuenta', String(live.status));
  check(html.includes('Creá tu cuenta para pujar'), 'muestra la tarjeta de cuenta');
  check(!html.includes('Confirmar puja'), 'no muestra el panel de puja');

  const vehicleId = (await db.doc('auctions/demo-auction-3').get()).data()?.['vehicleId'] as string;
  const v = (await db.doc(`vehicles/${vehicleId}`).get()).data() ?? {};
  for (const [name, value] of [
    ['VIN', v['vin']],
    ['chapa', v['licensePlate']],
  ] as const) {
    if (typeof value === 'string' && value)
      check(!html.includes(value), `el HTML público no trae ${name}`);
  }
  check(html.includes('"@type":"Car"'), 'datos estructurados de vehículo');
  check(!/<meta name="robots"/.test(html), 'indexable mientras está abierta');

  // Cada subasta sembrada (una por estado: por comenzar, abierta, con Compra ya,
  // con pujas cruzadas, ganada, reserva no alcanzada) responde, y ninguna filtra
  // su VIN ni su chapa.
  for (const doc of (await db.collection('auctions').get()).docs) {
    const a = doc.data();
    const res = await get(`/es/auctions/${doc.id}`);
    const label = `${doc.id} (${a['status']}/${a['outcome'] ?? '-'})`;
    if ((a['audience'] ?? 'retail') !== 'retail') {
      check(res.status === 404, `${label} mayorista: 404`);
      continue;
    }
    check(res.status === 200 || res.status === 307, `${label} responde`, String(res.status));
    if (res.status !== 200) continue;
    const body = await res.text();
    const veh = (await db.doc(`vehicles/${a['vehicleId']}`).get()).data() ?? {};
    for (const secret of [veh['vin'], veh['licensePlate']]) {
      if (typeof secret === 'string' && secret)
        check(!body.includes(secret), `${label} sin VIN ni chapa`);
    }
    if (a['status'] === 'scheduled')
      check(body.includes('Abre en'), `${label} muestra cuándo abre`);
  }

  const finished = await (await get('/es/auctions/demo-auction-5')).text();
  check(finished.includes('Subasta finalizada'), 'sin vender y sin subasta nueva: finalizada');
  check(
    /<meta name="robots" content="noindex, follow"/.test(finished),
    'finalizada fuera del índice',
  );

  // Una subasta mayorista nunca puede ser pública.
  await db
    .doc('auctions/verify-wholesale')
    .set({ ...(await db.doc('auctions/demo-auction-3').get()).data(), audience: 'wholesale' });
  check((await get('/es/auctions/verify-wholesale')).status === 404, 'mayorista da 404 sin cuenta');
  await db.doc('auctions/verify-wholesale').delete();

  // La ruta pública no es la "limpia": al haber más de un opengraph-image.tsx
  // en el árbol de rutas (portada y ficha), Next le agrega un sufijo hash al
  // segmento más un query de invalidación de caché — se ve en el propio
  // <meta property="og:image"> de la página. Leemos esa URL de ahí en vez de
  // adivinar la ruta, igual que haría un rastreador real (2026-09-26).
  const ogImageUrl = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
  const ogPath = ogImageUrl ? new URL(ogImageUrl).pathname + new URL(ogImageUrl).search : null;
  const og = ogPath ? await get(ogPath) : null;
  check(
    og?.status === 200 && og.headers.get('content-type') === 'image/png',
    'imagen para redes de la subasta',
  );

  const sitemap = await (await get('/sitemap.xml')).text();
  check(sitemap.includes('/es/auctions/demo-auction-3'), 'el sitemap trae la subasta en vivo');
  check(!sitemap.includes('/es/auctions/demo-auction-5'), 'el sitemap no trae la finalizada');

  const landing = await (await get('/es')).text();
  check(landing.includes('href="/es/auctions/demo-auction-3"'), 'la portada lleva a la ficha');

  // Con sesión: la página tiene que ser exactamente la vista de comprador de hoy.
  const sessionFor = async (email: string) => {
    const r = await fetch(
      `http://${process.env['FIREBASE_AUTH_EMULATOR_HOST']}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'Demo123456', returnSecureToken: true }),
      },
    );
    const { idToken } = (await r.json()) as { idToken: string };
    return getAuth().createSessionCookie(idToken, { expiresIn: 3_600_000 });
  };
  const buyer = await sessionFor('demo.comprador@renew.test');
  const signedIn = await get('/es/auctions/demo-auction-3', buyer);
  const signedInHtml = await signedIn.text();
  check(signedIn.status === 200, 'con sesión minorista: la ficha abre');
  check(!signedInHtml.includes('Creá tu cuenta para pujar'), 'con sesión: sin la tarjeta pública');

  // Un comprador mayorista sigue sin poder ver una subasta minorista (regla sin cambios).
  const wholesale = await sessionFor('demo.mayorista@renew.test');
  check(
    (await get('/es/auctions/demo-auction-3', wholesale)).status === 404,
    'mayorista con sesión: 404 en minorista',
  );

  console.log(`\n${failures === 0 ? 'Todo bien' : `${failures} fallas`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
