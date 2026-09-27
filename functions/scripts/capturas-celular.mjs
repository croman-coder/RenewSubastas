// Capturas del celular del comprador (spec 2026-09-27 §7), SOLO contra emuladores.
//
//   cd functions && FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
//   GCLOUD_PROJECT=carbid-staging node scripts/capturas-celular.mjs
//
// Necesita: emuladores auth, firestore y functions (con ENFORCE_APP_CHECK=false)
// con seed-demo-video cargado, y `next start -p 3016` de apps/web armado con
// NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true. Deja los PNG en OUT_DIR.
//
// La última parte hace una puja REAL en el emulador (demo-auction-1): para
// volver a correrlo, reiniciar los emuladores y volver a cargar el seed.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error('REFUSING TO RUN: faltan FIRESTORE_EMULATOR_HOST y FIREBASE_AUTH_EMULATOR_HOST.');
  process.exit(1);
}

// puppeteer-core no es dependencia del repo: se toma del lighthouse que ya
// bajó npx, para no sumar un navegador a pnpm-lock solo por las capturas. La
// ruta exacta del caché de npx cambia de una máquina a otra (y hasta de una
// corrida de npx a otra) — PUPPETEER_CORE_PATH permite pisarla sin editar el
// script, y si ninguna de las dos resuelve, un error claro en vez del
// MODULE_NOT_FOUND críptico de createRequire (D1).
const LIGHTHOUSE_PKG_JSON =
  process.env.PUPPETEER_CORE_PATH ??
  '/home/croman/.npm/_npx/5390d7d89c0de19d/node_modules/lighthouse/package.json';
let puppeteer;
try {
  const require = createRequire(LIGHTHOUSE_PKG_JSON);
  puppeteer = require('puppeteer-core');
} catch (e) {
  console.error(
    `REFUSING TO RUN: no se pudo cargar puppeteer-core desde "${LIGHTHOUSE_PKG_JSON}". ` +
      'Corré "npx -y lighthouse@12 --version" una vez para que npx lo baje, o pasá ' +
      'PUPPETEER_CORE_PATH=<ruta a un package.json de un módulo que tenga puppeteer-core ' +
      `como dependencia>. Detalle: ${e.message}`,
  );
  process.exit(1);
}

const BASE = 'http://localhost:3016';
const OUT = process.env.OUT_DIR ?? '/tmp/capturas-celular';
const CHROME = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
// Pixel y analytics fuera: no hay nada que medir en una captura y demoran networkidle.
const BLOCKED = ['facebook.net', 'facebook.com/tr', 'googletagmanager', 'google-analytics'];
const PASSWORD = 'Demo123456';

mkdirSync(OUT, { recursive: true });
initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'carbid-staging' });

let failures = 0;
function check(ok, label, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
}

async function sessionFor(email) {
  const r = await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
    },
  );
  const { idToken } = await r.json();
  return getAuth().createSessionCookie(idToken, { expiresIn: 3_600_000 });
}

async function openPage(browser, { width, scheme, session }) {
  const context = await browser.createBrowserContext();
  const mobile = width < 768;
  const page = await context.newPage();
  await page.setViewport({
    width,
    height: mobile ? 844 : 900,
    deviceScaleFactor: mobile ? 2 : 1,
    isMobile: mobile,
    hasTouch: mobile,
  });
  // Sin localStorage.theme en un contexto nuevo: next-themes usa el del sistema.
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
  await page.setRequestInterception(true);
  page.on('request', (req) =>
    BLOCKED.some((b) => req.url().includes(b)) ? req.abort() : req.continue(),
  );
  const cookies = [
    { name: 'renew_cookie_consent', value: 'accepted', domain: 'localhost', path: '/' },
  ];
  if (session) {
    cookies.push({
      name: '__session',
      value: session,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
    });
  }
  await context.setCookie(...cookies);
  return { page, context };
}

async function go(page, path) {
  // networkidle0 (0 conexiones) nunca se cumple acá: el comprador logueado
  // mantiene un Listen/channel de Firestore abierto (notification-bell,
  // BidDock) que no cierra entre navegaciones, así que goto() colgaba 30 s en
  // la primera página con datos en vivo (confirmado con un fetch de depuración
  // que mostró ese único channel "pendiente" para siempre). networkidle2
  // tolera esa conexión de fondo y sigue esperando a que el resto de la
  // página cargue.
  const res = await page.goto(BASE + path, { waitUntil: 'networkidle2' });
  return res?.status() ?? 0;
}

async function shot(page, name, fullPage = true) {
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage });
  console.log(`  → ${name}.png`);
}

// Visible de verdad: sin rectángulos si el elemento o un ancestro tiene
// display:none (lg:hidden, sm:hidden). Sirve también para los fixed.
const visible = (page, selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return !!el && el.getClientRects().length > 0;
  }, selector);

// innerText respeta text-transform: las píldoras y los rótulos en mayúsculas
// se comparan sin distinguir mayúsculas. innerText y no textContent: el
// segundo trae también el payload RSC de los <script> y encontraría todo.

const DOCK = 'section[aria-label="Barra de puja"]';
const TABS = 'nav[aria-label="Principal"].fixed';

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox'],
  });
  const buyer = await sessionFor('demo.comprador@renew.test');
  const rival = await sessionFor('demo.rival@renew.test');
  const staff = await sessionFor('demo.staff@renew.test');
  const admin = await sessionFor('demo.admin@renew.test');
  // Para el Lighthouse con sesión del Step 5 (cookie del emulador, sin valor afuera).
  writeFileSync(join(OUT, 'buyer-session.txt'), buyer);

  try {
    // 1) Comprador a 390 px, claro y oscuro.
    for (const scheme of ['light', 'dark']) {
      const { page, context } = await openPage(browser, { width: 390, scheme, session: buyer });

      check((await go(page, '/es/retail')) === 200, `[${scheme}] inicio abre`);
      const dark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
      check(dark === (scheme === 'dark'), `[${scheme}] el tema sigue al teléfono`);
      check(await visible(page, TABS), `[${scheme}] barra de pestañas visible`);
      check(
        (await page.$(`${TABS} a[aria-current="page"]`)) !== null,
        `[${scheme}] pestaña activa con aria-current`,
      );
      check(
        (await page.$('button[aria-label="Abrir menú"]')) === null,
        `[${scheme}] sin hamburguesa`,
      );
      const pb = await page.evaluate(() =>
        parseFloat(getComputedStyle(document.querySelector('main')).paddingBottom),
      );
      check(pb >= 64, `[${scheme}] el contenido deja lugar a la barra`, `${pb}px`);
      const home = await page.evaluate(() => document.body.innerText);
      check(/la próxima que cierra/i.test(home), `[${scheme}] tarjeta de la próxima que cierra`);
      check(home.includes('Vas ganando · USD 29.000'), `[${scheme}] va ganando la Tesla`);
      check(home.includes('USD 2.900'), `[${scheme}] seña del 10 % de 29.000`);
      await shot(page, `inicio-390-${scheme}`);

      check((await go(page, '/es/auctions')) === 200, `[${scheme}] catálogo abre`);
      const catalog = await page.evaluate(() => document.body.innerText);
      check(/compra ya usd 21\.000/i.test(catalog), `[${scheme}] píldora Compra ya`);
      check(/sin pujas/i.test(catalog), `[${scheme}] píldora Sin pujas`);
      check(/vas ganando/i.test(catalog), `[${scheme}] píldora Vas ganando`);
      await shot(page, `catalogo-390-${scheme}`);
      await page.type('input[type="search"]', 'amarok');
      const filtered = await page.evaluate(() => document.body.innerText);
      check(
        filtered.includes('Amarok') && !filtered.includes('Civic'),
        `[${scheme}] la búsqueda filtra sin tildes ni mayúsculas`,
      );
      await shot(page, `catalogo-busqueda-390-${scheme}`, false);

      check((await go(page, '/es/auctions/demo-auction-1')) === 200, `[${scheme}] ficha abre`);
      check(!(await visible(page, TABS)), `[${scheme}] sin barra de pestañas en la ficha`);
      const dockText = await page.$eval(DOCK, (el) => el.textContent ?? '');
      check(dockText.includes('USD 9.500'), `[${scheme}] dock con la próxima puja`, dockText);
      await shot(page, `ficha-dock-390-${scheme}`);

      await page.click(`${DOCK} button`);
      await page.waitForSelector('[role="dialog"]', { visible: true });
      await new Promise((r) => setTimeout(r, 400)); // termina la animación de entrada
      const focusInside = await page.evaluate(
        () => !!document.activeElement?.closest('[role="dialog"]'),
      );
      check(focusInside, `[${scheme}] el foco entra a la hoja`);
      for (let i = 0; i < 20; i++) await page.keyboard.press('Tab');
      const stillInside = await page.evaluate(
        () => !!document.activeElement?.closest('[role="dialog"]'),
      );
      check(stillInside, `[${scheme}] el foco queda atrapado en la hoja`);
      await shot(page, `hoja-390-${scheme}`, false);
      await page.keyboard.press('Escape');

      await go(page, '/es/auctions/demo-auction-3');
      const winText = await page.$eval(DOCK, (el) => el.textContent ?? '');
      check(
        winText.includes('Vas ganando') && winText.includes('29.000'),
        `[${scheme}] dock "Vas ganando" sin botón`,
      );
      check((await page.$(`${DOCK} button`)) === null, `[${scheme}] sin "Subir puja"`);
      await shot(page, `ficha-ganando-390-${scheme}`);

      await go(page, '/es/auctions/demo-auction-0');
      check(
        (await page.$eval(DOCK, (el) => el.textContent ?? '')).includes('Abre en'),
        `[${scheme}] dock de programada`,
      );

      await go(page, '/es/auctions/demo-auction-4');
      check((await page.$(DOCK)) === null, `[${scheme}] sin dock en la terminada`);
      check(
        (await page.evaluate(() => document.body.innerText)).includes('¡Ganaste la subasta!'),
        `[${scheme}] el resultado se ve en el celular`,
      );
      await shot(page, `ficha-ganada-390-${scheme}`);

      check((await go(page, '/es/retail/bids')) === 200, `[${scheme}] Mis pujas abre`);
      await shot(page, `mis-pujas-390-${scheme}`);
      await context.close();

      // Rodrigo: superado en la Tesla, para ver la tarjeta "Te superaron".
      const r = await openPage(browser, { width: 390, scheme, session: rival });
      await go(r.page, '/es/retail/bids?tab=lost');
      const bids = await r.page.evaluate(() => document.body.innerText);
      check(/te superaron/i.test(bids), `[${scheme}] tarjeta de superada`);
      check(bids.includes('Volver a pujar · USD 30.000'), `[${scheme}] con el mínimo siguiente`);
      await shot(r.page, `mis-pujas-superada-390-${scheme}`);
      await r.context.close();
    }

    // 2) Escritorio a 1280 px: catálogo, ficha y Mis pujas como antes.
    {
      const { page, context } = await openPage(browser, {
        width: 1280,
        scheme: 'light',
        session: buyer,
      });
      await go(page, '/es/auctions');
      check(!(await visible(page, TABS)), '[1280] sin barra de pestañas');
      check(!(await visible(page, 'input[type="search"]')), '[1280] sin buscador del celular');
      await shot(page, 'catalogo-1280');
      await go(page, '/es/auctions/demo-auction-1');
      check(!(await visible(page, DOCK)), '[1280] sin dock');
      check(
        /mínimo/i.test(await page.evaluate(() => document.body.innerText)),
        '[1280] el panel de puja sigue en la columna derecha',
      );
      await shot(page, 'ficha-1280');
      await go(page, '/es/retail/bids');
      check((await page.$('table')) !== null, '[1280] Mis pujas sigue en tabla');
      await shot(page, 'mis-pujas-1280');
      await go(page, '/es/retail');
      await shot(page, 'inicio-1280');
      await context.close();
    }

    // 3) Staff y admin en oscuro (riesgo de la spec §9): siguen con su cajón.
    for (const [who, session, paths] of [
      ['staff', staff, ['/es/staff', '/es/staff/auctions']],
      ['admin', admin, ['/es/admin', '/es/admin/users']],
    ]) {
      for (const width of [390, 1280]) {
        const { page, context } = await openPage(browser, { width, scheme: 'dark', session });
        for (const path of paths) {
          check((await go(page, path)) === 200, `[${who} ${width}] ${path} abre`);
          await shot(page, `${who}${path.replaceAll('/', '-')}-${width}-dark`);
        }
        if (width === 390) {
          check(
            (await page.$('button[aria-label="Abrir menú"]')) !== null,
            `[${who}] conserva la hamburguesa`,
          );
          check((await page.$(TABS)) === null, `[${who}] sin barra de pestañas`);
        }
        await context.close();
      }
    }

    // 4) Visitante sin sesión, en oscuro (D3): el tema ahora sigue al
    // teléfono en toda la app (defaultTheme="system"), no solo con sesión
    // iniciada — landing pública y ficha pública incluidas.
    {
      const { page, context } = await openPage(browser, { width: 390, scheme: 'dark' });
      check((await go(page, '/es')) === 200, '[visitante dark] landing abre');
      const landingDark = await page.evaluate(() =>
        document.documentElement.classList.contains('dark'),
      );
      check(landingDark, '[visitante dark] el tema sigue al teléfono en la landing');
      await shot(page, 'landing-es-390-dark');

      check(
        (await go(page, '/es/auctions/demo-auction-1')) === 200,
        '[visitante dark] ficha pública abre',
      );
      const publicDark = await page.evaluate(() =>
        document.documentElement.classList.contains('dark'),
      );
      check(publicDark, '[visitante dark] el tema sigue al teléfono en la ficha pública');
      await shot(page, 'ficha-publica-390-dark');
      await context.close();
    }

    // 5) Una puja real desde la hoja (functions en el emulador).
    {
      const { page, context } = await openPage(browser, {
        width: 390,
        scheme: 'light',
        session: buyer,
      });
      await go(page, '/es/auctions/demo-auction-1');
      await page.click(`${DOCK} button`);
      await page.waitForSelector('[role="dialog"]', { visible: true });
      await page.locator('[role="dialog"] button::-p-text(Mínimo)').click();
      await page.locator('button::-p-text(Confirmar puja)').click();
      await page.waitForFunction(() => document.querySelectorAll('[role="dialog"]').length === 0, {
        timeout: 20_000,
      });
      check(true, 'la hoja se cierra sola al confirmar la puja');
      // Ver Concern 3 del Task 9: en Puppeteer/CDP el segundo evento de un
      // canal de streaming largo (el onSnapshot de Firestore que ya estaba
      // abierto) a veces no llega al JS de la página, aunque la puja se
      // confirme bien en Firestore. Sin este try/catch, ese timeout mataba el
      // script entero y las capturas de después nunca corrían (D2).
      try {
        await page.waitForFunction(
          (sel) => document.querySelector(sel)?.textContent?.includes('Vas ganando'),
          { timeout: 20_000 },
          DOCK,
        );
        check(true, 'el dock pasa a "Vas ganando"');
      } catch (e) {
        check(false, 'el dock pasa a "Vas ganando"', e.message);
      }
      const price = await page.evaluate(() => document.body.innerText);
      check(price.includes('9.500'), 'el precio subió a 9.500');
      const unlocked = await page.evaluate(
        () =>
          document.body.style.pointerEvents !== 'none' &&
          !document.body.hasAttribute('data-scroll-locked'),
      );
      check(unlocked, 'la página queda usable (sin bloqueo de clics ni scroll)');
      await shot(page, 'ficha-despues-de-pujar-390');
      await context.close();
    }
  } finally {
    await browser.close();
  }

  console.log(`\n${failures === 0 ? 'Todo bien' : `${failures} fallas`} · capturas en ${OUT}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
