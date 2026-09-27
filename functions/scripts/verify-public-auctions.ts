// Comprobaciones de punta a punta de las páginas públicas de subasta, SOLO
// contra los EMULADORES.
//
//   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
//   GCLOUD_PROJECT=carbid-staging pnpm exec tsx scripts/verify-public-auctions.ts
//
// Hace falta: los emuladores arriba con seed-demo-video cargado, y `next start -p 3016`
// de apps/web corriendo con las mismas variables de emulador.
//
// Escribe en el emulador: marcadores de VIN y chapa en los vehículos de las
// subastas minoristas (se quedan: el emulador corre sin import/export) y dos
// subastas temporales que borra al terminar.
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

// Las dos variables: el script escribe en Firestore y además crea cookies de
// sesión con Admin Auth. Sin cualquiera de ellas, el Admin SDK iría al
// proyecto real, que es producción.
for (const name of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) {
  if (!process.env[name]) {
    console.error(`REFUSING TO RUN: ${name} is not set.`);
    process.exit(1);
  }
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
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Lo que el panel de puja dibuja apenas carga una subasta en vivo, sin abrir
// ningún diálogo: la casilla "Máximo" (junto a Mínimo e Incremento). No sirve
// "Confirmar puja", que vive en un diálogo cerrado y nunca está en el HTML, ni
// "Mínimo" o "Incremento", que están en los mensajes de next-intl que viajan
// en el HTML de todas las páginas. Con los signos de etiqueta, para que sea el
// texto de un elemento y no parte de otra frase.
const BID_PANEL_MARKER = '>Máximo<';

// Marcadores inventados, uno por vehículo, para que el chequeo de filtración
// corra en todas las fichas: el seed trae VIN en 2 de 6 vehículos y ninguna chapa.
const sentinelVin = (n: number) => `VERIFYVIN${String(n).padStart(7, '0')}`;
const sentinelPlate = (n: number) => `VRF-${String(n).padStart(4, '0')}`;

// La URL de og:image se lee del HTML, como haría un rastreador. La ruta lleva un
// sufijo (`opengraph-image-xxxxxx`) porque la ficha vive dentro del grupo de
// rutas (abierto): Next le agrega ese hash a toda ruta de metadata que tenga un
// grupo o una ruta paralela en el camino (getMetadataRouteSuffix). La imagen de
// la portada, /es/opengraph-image, no lo lleva justamente porque no está en un
// grupo. Además va un query con el hash del contenido, para invalidar cachés.
async function checkOgImage(html: string, label: string) {
  const content = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
  if (!content) {
    check(false, `${label} imagen para redes`, 'sin og:image');
    return;
  }
  let path: string;
  try {
    const u = new URL(content);
    path = u.pathname + u.search;
  } catch {
    // Una og:image relativa no le sirve a WhatsApp ni a Facebook: cuenta como
    // una falla más, sin cortar el resto de las comprobaciones.
    check(false, `${label} imagen para redes`, `og:image no es una URL absoluta: ${content}`);
    return;
  }
  const og = await get(path);
  await og.arrayBuffer();
  const type = og.headers.get('content-type') ?? '';
  check(
    og.status === 200 && type === 'image/png',
    `${label} imagen para redes`,
    `${og.status} ${type}`,
  );
}

async function main() {
  const auctions = (await db.collection('auctions').get()).docs;
  const retail = auctions.filter((d) => (d.data()['audience'] ?? 'retail') === 'retail');

  // Antes de cualquier chequeo: marcadores de VIN y chapa en cada vehículo de
  // una subasta minorista.
  const vehicleIds = [
    ...new Set(retail.map((d) => d.data()['vehicleId'] as string | undefined).filter(Boolean)),
  ] as string[];
  const sentinels = new Map(
    vehicleIds.map((id, i) => [id, { vin: sentinelVin(i + 1), plate: sentinelPlate(i + 1) }]),
  );
  for (const [id, s] of sentinels) {
    await db.doc(`vehicles/${id}`).set({ vin: s.vin, licensePlate: s.plate }, { merge: true });
  }
  const sentinelsWrittenAt = Date.now();
  const allSentinels = [...sentinels.values()].flatMap((s) => [s.vin, s.plate]);

  // El hreflang vive en la metadata de cada página: ninguna respuesta lo
  // anuncia por cabecera (antes next-intl mandaba /en y un x-default que
  // redirige). La cabecera `Link` en sí sigue llegando, y está bien: Next la
  // usa para precargar las fuentes de next/font (rel=preload).
  for (const path of ['/es', '/es/auctions/demo-auction-3']) {
    const res = await get(path);
    await res.text();
    const link = res.headers.get('link') ?? '';
    const hreflang = /hreflang|rel="?alternate/i.test(link);
    check(!hreflang, `${path} sin hreflang en la cabecera Link`, hreflang ? link : '');
  }

  const live = await get('/es/auctions/demo-auction-3');
  const html = await live.text();
  check(live.status === 200, 'ficha en vivo abre sin cuenta', String(live.status));
  check(html.includes('Creá tu cuenta para pujar'), 'muestra la tarjeta de cuenta');
  check(!html.includes(BID_PANEL_MARKER), 'no muestra el panel de puja');
  check(html.includes('"@type":"Car"'), 'datos estructurados de vehículo');
  check(!/<meta name="robots"/.test(html), 'indexable mientras está abierta');

  // Una subasta mayorista nunca puede ser pública.
  const wholesaleRef = db.doc('auctions/verify-wholesale');
  await wholesaleRef.set({
    ...(await db.doc('auctions/demo-auction-3').get()).data(),
    audience: 'wholesale',
  });
  try {
    const res = await get('/es/auctions/verify-wholesale');
    await res.text();
    check(res.status === 404, 'mayorista da 404 sin cuenta', String(res.status));
  } finally {
    await wholesaleRef.delete();
  }

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
  // Controles positivos: prueban que el marcador del panel y los de VIN y chapa
  // aparecen cuando corresponde, así que su ausencia en la ficha pública vale.
  check(signedInHtml.includes(BID_PANEL_MARKER), 'con sesión: el panel de puja está');
  const liveVehicle = sentinels.get(
    (await db.doc('auctions/demo-auction-3').get()).data()?.['vehicleId'] as string,
  );
  check(
    Boolean(liveVehicle) &&
      signedInHtml.includes(liveVehicle!.vin) &&
      signedInHtml.includes(liveVehicle!.plate),
    'con sesión: la ficha muestra VIN y chapa',
  );

  // Un comprador mayorista sigue sin poder ver una subasta minorista (regla sin cambios).
  const wholesale = await sessionFor('demo.mayorista@renew.test');
  const wholesaleView = await get('/es/auctions/demo-auction-3', wholesale);
  await wholesaleView.text();
  check(wholesaleView.status === 404, 'mayorista con sesión: 404 en minorista');

  // loadPublicAuction cachea 30 s por id: una ficha pedida antes de escribir los
  // marcadores saldría de datos sin ellos y el chequeo de filtración no probaría
  // nada. Se deja vencer ese cache y se pide cada ficha una vez, para que Next
  // la regenere (sirve la copia vencida y regenera por detrás) antes de mirar.
  const wait = sentinelsWrittenAt + 31_000 - Date.now();
  if (wait > 0) {
    console.log(`… esperando ${Math.ceil(wait / 1000)} s a que venza el cache público`);
    await sleep(wait);
  }
  for (const doc of retail) await (await get(`/es/auctions/${doc.id}`)).text();
  await sleep(2_000);

  // Cada subasta sembrada (una por estado: por comenzar, abierta, con Compra ya,
  // con pujas cruzadas, ganada, reserva no alcanzada) responde, no filtra ningún
  // VIN ni chapa, y su imagen para redes se genera.
  for (const doc of auctions) {
    const a = doc.data();
    const res = await get(`/es/auctions/${doc.id}`);
    const body = await res.text();
    const label = `${doc.id} (${a['status']}/${a['outcome'] ?? '-'})`;
    if ((a['audience'] ?? 'retail') !== 'retail') {
      check(res.status === 404, `${label} mayorista: 404`);
      continue;
    }
    check(res.status === 200 || res.status === 307, `${label} responde`, String(res.status));
    if (res.status !== 200) continue;
    const leaked = allSentinels.filter((s) => body.includes(s));
    check(leaked.length === 0, `${label} sin VIN ni chapa`, leaked.join(', '));
    if (a['status'] === 'scheduled')
      check(body.includes('Abre en'), `${label} muestra cuándo abre`);
    await checkOgImage(body, label);
  }

  const finished = await (await get('/es/auctions/demo-auction-5')).text();
  check(finished.includes('Subasta finalizada'), 'sin vender y sin subasta nueva: finalizada');
  check(
    /<meta name="robots" content="noindex, follow"/.test(finished),
    'finalizada fuera del índice',
  );

  // Si el vehículo vuelve a subasta, el link viejo lleva a la nueva con una
  // redirección temporal: así, si la nueva también termina sin vender, el link
  // sigue la misma regla otra vez (spec §6).
  const finishedVehicleId = (await db.doc('auctions/demo-auction-5').get()).data()?.['vehicleId'];
  const relistRef = db.doc('auctions/verify-relist');
  const now = Date.now();
  await relistRef.set({
    id: 'verify-relist',
    vehicleId: finishedVehicleId,
    audience: 'retail',
    status: 'scheduled',
    startsAt: Timestamp.fromMillis(now + 3_600_000),
    endsAt: Timestamp.fromMillis(now + 26 * 3_600_000),
    startingPrice: 8000,
    bidIncrement: 250,
    currentBid: 0,
    bidCount: 0,
  });
  try {
    const moved = await get('/es/auctions/demo-auction-5');
    await moved.text();
    const location = moved.headers.get('location') ?? '';
    check(
      moved.status === 307 && location.endsWith('/es/auctions/verify-relist'),
      'sin vender con subasta nueva: 307 a la nueva',
      `${moved.status} ${location}`,
    );
  } finally {
    await relistRef.delete();
  }

  console.log(`\n${failures === 0 ? 'Todo bien' : `${failures} fallas`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

// Queda como prueba manual, en un celular: el botón "Compartir" de la ficha
// pública abre la hoja de compartir del sistema y, al elegir WhatsApp, el
// mensaje lleva "Mirá este … en subasta" y el link, con la vista previa de la
// foto. Este script no puede probarlo porque corre sin navegador.
