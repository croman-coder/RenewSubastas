// End-to-end flow test against the Firebase emulators.
// Exercises the real money/auction handlers in sequence and asserts the
// audit fixes (self-outbid blocked, displaced tracking, close, payment
// recheck). Run with the emulator up:
//   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
//   FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199 \
//   GCLOUD_PROJECT=carbid-staging \
//   pnpm exec tsx scripts/e2e-flow.ts
//
// Pre-init the default app WITH a storageBucket so submitPaymentProof's
// bucket() call works in a standalone script (admin.ts reuses this app).
import { initializeApp, getApps } from 'firebase-admin/app';
if (!getApps().length) {
  initializeApp({ projectId: 'carbid-staging', storageBucket: 'carbid-staging.appspot.com' });
}

import type { CallableRequest } from 'firebase-functions/v2/https';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '../src/lib/admin.js';
import { placeBidHandler } from '../src/auctions/placeBid.js';
import { runTickAuctions } from '../src/auctions/tickAuctions.js';
import { submitPaymentProofHandler } from '../src/auctions/submitPaymentProof.js';
import { confirmAuctionPaymentHandler } from '../src/auctions/confirmAuctionPayment.js';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : '');
  }
}
async function expectThrow(name: string, fn: () => Promise<unknown>, codeContains: string) {
  try {
    await fn();
    failed++;
    console.log(`  ✗ ${name} (no lanzó error; se esperaba ${codeContains})`);
  } catch (e) {
    const code = (e as { code?: string }).code ?? (e as Error).message;
    check(`${name} (rechazado: ${code})`, String(code).includes(codeContains), code);
  }
}

const buyer = (uid: string, data: Record<string, unknown> = {}): CallableRequest =>
  ({
    auth: { uid, token: { role: 'buyer', status: 'active' } as never },
    rawRequest: {} as never,
    data,
  }) as CallableRequest;
const admin = (data: Record<string, unknown> = {}): CallableRequest =>
  ({
    auth: { uid: 'e2e-admin', token: { role: 'admin', status: 'active' } as never },
    rawRequest: {} as never,
    data,
  }) as CallableRequest;

async function seedBuyer(uid: string, firstName: string) {
  await adminDb()
    .doc(`users/${uid}`)
    .set({
      uid,
      role: 'buyer',
      email: `${uid}@example.com`,
      status: 'active',
      profile: {
        firstName,
        lastName: 'Test',
        documentType: 'CI',
        documentNumber: '1234567',
        phone: '+595971000000',
      },
      preferences: { locale: 'es', theme: 'system', notifications: {} },
      createdBy: 'e2e',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
}

async function main() {
  console.log('\n=== E2E flujo completo de subasta ===\n');
  const A = 'e2e-buyer-a';
  const B = 'e2e-buyer-b';
  const vehicleId = 'v-e2e';

  // --- Setup ---
  await seedBuyer(A, 'Ana');
  await seedBuyer(B, 'Bruno');
  await adminDb().doc(`vehicles/${vehicleId}`).set({
    id: vehicleId,
    make: 'Toyota',
    model: 'Corolla',
    year: 2021,
    status: 'in_auction',
    licensePlate: 'ABC123',
    vin: 'VIN-E2E',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const aRef = adminDb().collection('auctions').doc();
  const auctionId = aRef.id;
  // endsAt far enough that bids don't trigger anti-sniping (default 60s).
  await aRef.set({
    id: auctionId,
    vehicleId,
    vehicleSnapshot: { make: 'Toyota', model: 'Corolla', year: 2021 },
    audience: 'retail',
    startingPrice: 5000,
    bidIncrement: 500,
    startsAt: Timestamp.fromMillis(Date.now() - 60_000),
    endsAt: Timestamp.fromMillis(Date.now() + 600_000),
    currentBid: 0,
    bidCount: 0,
    status: 'live',
    createdBy: 'e2e',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  console.log(`Subasta ${auctionId} (Corolla 2021, base 5000, incremento 500)\n`);

  // --- 1. Ana puja 5000 ---
  console.log('1) Ana puja 5000');
  const r1 = await placeBidHandler(buyer(A, { auctionId, amount: 5000 }));
  check('puja aceptada, currentBid=5000', r1.newCurrentBid === 5000, r1);
  let a = (await aRef.get()).data()!;
  check('currentBidderUid = Ana', a['currentBidderUid'] === A);

  // --- 2. Ana intenta auto-superarse (self-outbid) -> bloqueado ---
  console.log('2) Ana intenta volver a pujar (self-outbid)');
  await expectThrow(
    'self-outbid bloqueado',
    () => placeBidHandler(buyer(A, { auctionId, amount: 5500 })),
    'failed-precondition',
  );

  // --- 3. Bruno supera con 5500 ---
  console.log('3) Bruno puja 5500 (supera a Ana)');
  const r3 = await placeBidHandler(buyer(B, { auctionId, amount: 5500 }));
  check('puja aceptada, currentBid=5500', r3.newCurrentBid === 5500, r3);
  const bidDoc = (await aRef.collection('bids').doc(r3.bidId).get()).data()!;
  check(
    'bid registra displacedBuyerUid = Ana',
    bidDoc['displacedBuyerUid'] === A,
    bidDoc['displacedBuyerUid'],
  );
  check(
    'bid registra displacedAmount = 5000',
    bidDoc['displacedAmount'] === 5000,
    bidDoc['displacedAmount'],
  );

  // --- 4. Bruno intenta auto-superarse -> bloqueado ---
  console.log('4) Bruno intenta volver a pujar (self-outbid)');
  await expectThrow(
    'self-outbid bloqueado',
    () => placeBidHandler(buyer(B, { auctionId, amount: 6000 })),
    'failed-precondition',
  );

  // --- 5. Cierre de la subasta (tickAuctions con tiempo futuro) ---
  console.log('5) Cierre de la subasta (tickAuctions)');
  const res = await runTickAuctions(Date.now() + 700_000);
  check('tickAuctions cerró >=1 subasta', res.closed >= 1, res);
  a = (await aRef.get()).data()!;
  check('estado = ended', a['status'] === 'ended', a['status']);
  check('outcome = sold', a['outcome'] === 'sold', a['outcome']);
  check('ganador = Bruno', a['winnerUid'] === B, a['winnerUid']);
  check('precio final = 5500', a['finalPrice'] === 5500, a['finalPrice']);
  check(
    'paymentStatus = pending_payment',
    a['paymentStatus'] === 'pending_payment',
    a['paymentStatus'],
  );
  const veh = (await adminDb().doc(`vehicles/${vehicleId}`).get()).data()!;
  check('vehículo marcado sold', veh['status'] === 'sold', veh['status']);

  // --- 6. Bruno (ganador) sube comprobante ---
  console.log('6) Bruno sube comprobante de seña');
  const proof = await submitPaymentProofHandler(
    buyer(B, { auctionId, storagePath: `payment-proofs/${auctionId}/${B}-test.pdf` }),
  );
  check('submitPaymentProof ok', proof.ok === true, proof);
  a = (await aRef.get()).data()!;
  check('auction registra paymentProofPath', !!a['paymentProofPath'], a['paymentProofPath']);

  // --- 7. Admin confirma la seña ---
  console.log('7) Admin confirma la seña (paid)');
  const conf = await confirmAuctionPaymentHandler(
    admin({ auctionId, action: 'paid', note: 'e2e' }),
  );
  check('confirmAuctionPayment ok', conf.ok === true, conf);
  a = (await aRef.get()).data()!;
  check('paymentStatus = paid', a['paymentStatus'] === 'paid', a['paymentStatus']);

  // --- 8. Comprobante tardío tras pago -> rechazado (fix M4) ---
  console.log('8) Bruno intenta subir comprobante de nuevo (ya pagado)');
  await expectThrow(
    'comprobante rechazado (ya pagado)',
    () =>
      submitPaymentProofHandler(
        buyer(B, { auctionId, storagePath: `payment-proofs/${auctionId}/${B}-late.pdf` }),
      ),
    'failed-precondition',
  );

  // --- Limpieza ---
  await aRef
    .collection('bids')
    .listDocuments()
    .then((ds) => Promise.all(ds.map((d) => d.delete())));
  await aRef.delete();
  await adminDb().doc(`vehicles/${vehicleId}`).delete();
  await adminDb().doc(`users/${A}`).delete();
  await adminDb().doc(`users/${B}`).delete();
  await adminDb()
    .doc(`rate_limits/bids_${A}`)
    .delete()
    .catch(() => {});
  await adminDb()
    .doc(`rate_limits/bids_${B}`)
    .delete()
    .catch(() => {});

  console.log(`\n=== Resultado: ${passed} OK, ${failed} fallo(s) ===\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('E2E crashed:', e);
  process.exit(1);
});
