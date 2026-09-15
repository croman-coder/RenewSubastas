// Verifica los INVARIANTES de una subasta después de la prueba de carga.
//
// La latencia dice si el sistema respondió rápido; esto dice si respondió
// BIEN. Con 100 compradores pegándole al mismo documento, lo que puede
// romperse silenciosamente es la consistencia: dos pujas "ganadoras" a la
// vez, un bidCount que no coincide con las pujas guardadas, un currentBid
// menor que alguna puja aceptada, o pujas fuera de orden. Nada de eso lo
// detecta k6 — sólo se ve leyendo el estado final.
//
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=carbid-staging \
//     node functions/scripts/verify-load-auction.mjs ui-e2e-auction
//
// SÓLO emulador: aborta si FIRESTORE_EMULATOR_HOST no está seteado. Es de
// sólo lectura, pero el hábito de no apuntar herramientas de prueba a
// producción se sostiene sin excepciones.
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('REFUSING TO RUN: FIRESTORE_EMULATOR_HOST no está seteado.');
  process.exit(2);
}
const auctionId = process.argv[2];
if (!auctionId) {
  console.error('Uso: node functions/scripts/verify-load-auction.mjs <auctionId>');
  process.exit(2);
}

if (!getApps().length) initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'carbid-staging' });
const db = getFirestore();

let failed = 0;
function check(name, cond, extra) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failed++;
    console.log(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : '');
  }
}

const aRef = db.doc(`auctions/${auctionId}`);
const aSnap = await aRef.get();
if (!aSnap.exists) {
  console.error(`La subasta ${auctionId} no existe.`);
  process.exit(2);
}
const a = aSnap.data();
const bidsSnap = await aRef.collection('bids').orderBy('createdAt', 'asc').get();
const bids = bidsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

console.log(`\n=== Invariantes de ${auctionId} ===`);
console.log(
  `status=${a.status} currentBid=${a.currentBid} bidCount=${a.bidCount} bids guardadas=${bids.length}\n`,
);

const winning = bids.filter((b) => b.status === 'winning');
const maxAmount = bids.reduce((m, b) => Math.max(m, Number(b.amount) || 0), 0);
const top = bids.find((b) => Number(b.amount) === maxAmount);

check('exactamente UNA puja con status=winning', winning.length === 1, winning.length);
check('bidCount == cantidad de pujas guardadas', a.bidCount === bids.length, {
  bidCount: a.bidCount,
  guardadas: bids.length,
});
check('currentBid == la puja más alta guardada', a.currentBid === maxAmount, {
  currentBid: a.currentBid,
  maxAmount,
});
check(
  'la puja winning ES la más alta',
  winning.length === 1 && Number(winning[0].amount) === maxAmount,
  winning[0]?.amount,
);
check('currentBidderUid == autor de la puja más alta', top && a.currentBidderUid === top.buyerUid, {
  currentBidderUid: a.currentBidderUid,
  topBidder: top?.buyerUid,
});

// Orden estricto: cada puja aceptada tuvo que superar a la anterior. Si dos
// transacciones hubieran leído el mismo currentBid y ambas escrito, acá
// aparecería una puja igual o menor que su predecesora.
let monotonic = true;
let firstBreak = null;
for (let i = 1; i < bids.length; i++) {
  if (Number(bids[i].amount) <= Number(bids[i - 1].amount)) {
    monotonic = false;
    firstBreak = { i, prev: bids[i - 1].amount, cur: bids[i].amount };
    break;
  }
}
check('montos estrictamente crecientes en orden de creación', monotonic, firstBreak);

// Nadie se superó a sí mismo: dos pujas consecutivas del mismo comprador
// significan que el bloqueo de self-outbid falló bajo concurrencia.
let selfOutbid = null;
for (let i = 1; i < bids.length; i++) {
  if (bids[i].buyerUid === bids[i - 1].buyerUid) {
    selfOutbid = { i, uid: bids[i].buyerUid };
    break;
  }
}
check(
  'ninguna puja consecutiva del mismo comprador (self-outbid)',
  selfOutbid === null,
  selfOutbid,
);

// Cada puja desplazada apunta a la anterior real.
let displacedOk = true;
let firstDisplacedBreak = null;
for (let i = 1; i < bids.length; i++) {
  const prev = bids[i - 1];
  const cur = bids[i];
  if (
    cur.displacedBuyerUid !== prev.buyerUid ||
    Number(cur.displacedAmount) !== Number(prev.amount)
  ) {
    displacedOk = false;
    firstDisplacedBreak = {
      i,
      esperado: { uid: prev.buyerUid, amount: prev.amount },
      guardado: { uid: cur.displacedBuyerUid, amount: cur.displacedAmount },
    };
    break;
  }
}
check('cada puja registra a quién desplazó y por cuánto', displacedOk, firstDisplacedBreak);

console.log(`\n=== ${failed === 0 ? 'CONSISTENTE' : `${failed} invariante(s) rotos`} ===\n`);
process.exit(failed === 0 ? 0 : 1);
