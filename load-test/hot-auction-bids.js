// Prueba de carga del caso crítico: muchos compradores pujando LA MISMA
// subasta al mismo tiempo. No es "100 usuarios en la app" —eso Firestore lo
// aguanta de sobra— sino el punto donde el diseño se estrangula: placeBid
// corre una transacción sobre el documento de la subasta, y Firestore sostiene
// ~1 escritura/segundo por documento. Todas las pujas a una misma subasta se
// serializan por ese doc, así que esto mide exactamente eso.
//
// Correr:
//   1. Minta 100 compradores + tokens (contra emuladores):
//        FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
//        GCLOUD_PROJECT=carbid-staging \
//        pnpm --filter @carbid/functions exec tsx scripts/mint-load-tokens.ts 100 > /tmp/tokens.json
//   2. k6 run \
//        -e BASE_URL=http://127.0.0.1:5002/carbid-staging/us-central1 \
//        -e AUCTION_ID=ui-e2e-auction \
//        -e TOKENS_FILE=/tmp/tokens.json \
//        -e START_PRICE=8000 -e INCREMENT=500 \
//        load-test/hot-auction-bids.js
//
// Qué NO hace: no golpea producción. BASE_URL apunta a donde vos digas —
// emuladores o un staging descartable—, nunca a renewsubastas por defecto.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Counter, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL;
const AUCTION_ID = __ENV.AUCTION_ID;
const TOKENS_FILE = __ENV.TOKENS_FILE;
const START_PRICE = Number(__ENV.START_PRICE || '8000');
const INCREMENT = Number(__ENV.INCREMENT || '500');
const APPCHECK = __ENV.APPCHECK_TOKEN || '';

if (!BASE_URL || !AUCTION_ID || !TOKENS_FILE) {
  throw new Error('Faltan BASE_URL, AUCTION_ID o TOKENS_FILE (ver cabecera del archivo).');
}

// Un token de ID por comprador simulado. SharedArray los carga una sola vez y
// los comparte entre VUs sin duplicar memoria.
const tokens = new SharedArray('tokens', () => JSON.parse(open(TOKENS_FILE)));

// Se separan los rechazos legítimos ("tu puja quedó baja porque otro subió
// primero" — comportamiento correcto bajo competencia) de la señal que importa:
// abortos por contención de la transacción, que es el sistema doblándose.
const accepted = new Counter('bids_accepted');
const tooLow = new Counter('bids_rejected_business'); // esperado y sano
const rateLimited = new Counter('bids_rejected_ratelimit'); // tope 10/min por comprador
const contention = new Counter('bids_contention_aborts'); // la señal de estrés
const setupErr = new Counter('bids_setup_errors'); // la prueba está mal armada
const transportErr = new Counter('bids_transport_errors'); // sin respuesta HTTP (status 0)
const otherErr = new Counter('bids_other_errors');
const bidLatency = new Trend('bid_latency_ms', true);

// placeBid limita a 10 pujas por minuto POR COMPRADOR (placeBid.ts,
// RATE_LIMIT_MAX). Un VU que dispara sin pausa agota su cupo en segundos y de
// ahí en más todo lo que recibe es resource-exhausted — una versión anterior
// de este script contaba eso como "contención", así que el resultado era una
// alarma falsa garantizada. Cada VU espera este intervalo entre pujas: 100
// compradores × 10 pujas/min = ~17 pujas/segundo sobre UN documento, que es
// la ráfaga real que queremos medir y ya está muy por encima de la ~1
// escritura/segundo/documento que Firestore sostiene.
const PACE_SECONDS = Number(__ENV.PACE_SECONDS || '6');

export const options = {
  scenarios: {
    // Sube a 100 pujadores concurrentes sobre una sola subasta y los sostiene.
    embestida: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 100 },
        { duration: '60s', target: 100 },
        { duration: '10s', target: 0 },
      ],
      gracefulStop: '10s',
    },
  },
  thresholds: {
    // El sistema NO debe caerse: los errores no-de-negocio se mantienen bajos
    // y la latencia p95 de una puja se queda por debajo de 3s aun con 100
    // encima del mismo documento. Un solo error de armado invalida la corrida.
    bids_other_errors: ['count<10'],
    bids_setup_errors: ['count<1'],
    // Contra el emulador el transporte falla un ~5% por diseño del emulador
    // (ver `transportErr`); contra Cloud Functions reales bajá esto a 'count<10'
    // con -e TRANSPORT_MAX=10.
    bids_transport_errors: [`count<${__ENV.TRANSPORT_MAX || '150'}`],
    bid_latency_ms: ['p(95)<3000'],
  },
};

export default function () {
  const token = tokens[__VU % tokens.length];
  // Cada VU apunta un poco más alto que el precio base según su número, para
  // que las pujas compitan de verdad en vez de ser todas idénticas.
  const amount = START_PRICE + INCREMENT * (1 + (__ITER % 40));

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
  if (APPCHECK) headers['X-Firebase-AppCheck'] = APPCHECK;

  const res = http.post(
    `${BASE_URL}/placeBid`,
    JSON.stringify({ data: { auctionId: AUCTION_ID, amount } }),
    { headers, tags: { name: 'placeBid' } },
  );

  bidLatency.add(res.timings.duration);

  const body = safeJson(res.body);
  const errMsg = body?.error?.message ?? '';
  const errStatus = body?.error?.status ?? '';

  if (res.status === 0) {
    // No hubo respuesta HTTP: EOF / connection reset / timeout del lado del
    // transporte. Contra el EMULADOR esto es un artefacto conocido — corre
    // todas las funciones en un solo proceso Node y descarta conexiones bajo
    // ráfaga de 60+ VUs. Contra Cloud Functions reales (instancias con 80
    // pedidos concurrentes cada una) sí sería una señal de saturación, y ahí
    // el umbral de abajo tiene que ser estricto.
    transportErr.add(1);
    if (__ENV.DEBUG_ERRORS) console.log(`[transport] err=${res.error} code=${res.error_code}`);
  } else if (res.status === 200 && body?.result) {
    accepted.add(1);
  } else if (/at least|below|too low|ya sos el mejor/i.test(errMsg)) {
    // Rechazo correcto: otro pujó más alto primero, o ya vas ganando. Sano.
    tooLow.add(1);
  } else if (/rate limit/i.test(errMsg)) {
    // Tope por comprador (10/min). Es una regla de negocio funcionando, no
    // estrés — y con PACE_SECONDS=6 no debería aparecer casi nunca. Si crece,
    // el ritmo de la prueba está mal, no el sistema.
    rateLimited.add(1);
  } else if (/profile_incomplete|Only buyers|Invalid input|not found/i.test(errMsg)) {
    // La prueba está mal armada (tokens sin perfil, rol equivocado, subasta
    // inexistente). No dice nada del sistema bajo carga: hay que arreglar el
    // seed y volver a correr.
    setupErr.add(1);
  } else if (
    errStatus === 'RESOURCE_EXHAUSTED' ||
    errStatus === 'ABORTED' ||
    errStatus === 'UNAVAILABLE' ||
    /aborted|contention|too much contention|deadline/i.test(errMsg) ||
    res.status === 429 ||
    res.status >= 500
  ) {
    // La señal que buscamos: la transacción no pudo cerrar por competencia
    // sobre el documento, o la función se saturó.
    contention.add(1);
    if (__ENV.DEBUG_ERRORS) console.log(`[contention] ${res.status} ${errStatus} ${errMsg}`);
  } else {
    otherErr.add(1);
    // Un "otro error" sin texto es inauditable. Con DEBUG_ERRORS=1 se imprime
    // cada uno para poder clasificarlo (y agregarlo arriba si es recurrente).
    if (__ENV.DEBUG_ERRORS) {
      console.log(
        `[other] http=${res.status} err=${res.error} code=${res.error_code} status=${errStatus} msg=${errMsg} body=${String(res.body).slice(0, 200)}`,
      );
    }
  }

  check(res, {
    'no 5xx': (r) => r.status < 500,
  });

  sleep(PACE_SECONDS);
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/*
CÓMO LEER EL RESULTADO
----------------------
- bids_accepted        pujas que entraron. Con 100 sobre una subasta, la
                       mayoría NO entra (sólo una puede ir ganando a la vez):
                       eso es correcto.
- bids_rejected_business  "quedó baja" / "ya sos el mejor". Esperado y sano.
- bids_rejected_ratelimit tope de 10/min por comprador. Debe ser ~0 con el
                       ritmo por defecto; si no, la prueba va muy rápido.
- bids_setup_errors    perfil incompleto / rol / subasta inexistente: la
                       prueba está mal armada. Umbral: cero.
- bids_contention_aborts  ← LA MÉTRICA CLAVE. Si sube con la carga, el
                       documento de la subasta es el cuello de botella.
- bid_latency_ms p95   cuánto tarda una puja bajo presión. Si p95 se dispara,
                       los usuarios ven el botón "Pujando…" colgado.

CONTRA STAGING (no producción)
------------------------------
- BASE_URL = la URL desplegada del callable, p. ej.
  https://us-central1-<staging-project>.cloudfunctions.net
- Los tokens hay que mintarlos contra el Auth de ese proyecto, no del emulador.
- App Check: si está forzado, k6 necesita un token de depuración
  (X-Firebase-AppCheck) o desplegar staging con ENFORCE_APP_CHECK=false.
*/
