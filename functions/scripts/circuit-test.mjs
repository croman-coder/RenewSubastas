// End-to-end circuit test for the auction lifecycle.
//
// Usage:
//   node scripts/circuit-test.mjs setup    # create vehicle + live auction + bid
//   node scripts/circuit-test.mjs check     # verify it closed + winner + payment + email
//
// Flow exercised: vehicle(ready) -> auction(live, ~90s window) -> bid by a
// real wholesale buyer -> [tickAuctions closes it] -> winnerUid set ->
// sendAuctionWon trigger emails the buyer.
//
// After `setup`, wait ~2 minutes (tickAuctions runs every 1 min) then run
// `check`. The check reads the auction state and prints exactly what the
// production triggers should have done.

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const sa = JSON.parse(readFileSync('/home/croman/keys/carbid-staging-sa.json', 'utf8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const STATE_FILE = '/tmp/carbid-circuit-state.json';
const TEST_BUYER_UID = 'Bq9Ysed2wvYRjlQSxOgaik73tnw2'; // ymk5py@gmail.com (wholesale)
const AUDIENCE = 'wholesale';

const mode = process.argv[2];

async function setup() {
  console.log('=== SETUP ===');

  // 1. Vehicle (ready)
  const vRef = db.collection('vehicles').doc();
  await vRef.set({
    id: vRef.id,
    make: 'TEST',
    model: 'Circuit Runner',
    year: 2026,
    audience: AUDIENCE,
    status: 'ready',
    transmission: 'automatic',
    fuelType: 'gasoline',
    condition: 'used',
    description: { es: 'Vehículo de prueba de circuito.', en: '' },
    images: [],
    createdBy: 'system-circuit-test',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  console.log('Vehicle created:', vRef.id);

  // 2. Auction (live, closes in ~90s)
  const now = Date.now();
  const endsAt = now + 90_000;
  const aRef = db.collection('auctions').doc();
  await aRef.set({
    id: aRef.id,
    vehicleId: vRef.id,
    audience: AUDIENCE,
    vehicleSnapshot: { make: 'TEST', model: 'Circuit Runner', year: 2026 },
    startingPrice: 5000,
    bidIncrement: 500,
    startsAt: Timestamp.fromMillis(now - 5000),
    endsAt: Timestamp.fromMillis(endsAt),
    currentBid: 0,
    bidCount: 0,
    status: 'live',
    createdBy: 'system-circuit-test',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  // vehicle -> in_auction
  await vRef.update({ status: 'in_auction', updatedAt: FieldValue.serverTimestamp() });
  console.log('Auction created (live):', aRef.id, '| closes in ~90s');

  // 3. Bid by real wholesale buyer
  const userSnap = await db.doc(`users/${TEST_BUYER_UID}`).get();
  const profile = userSnap.data()?.profile ?? {};
  const amount = 6000;
  const bidRef = aRef.collection('bids').doc();
  await bidRef.set({
    id: bidRef.id,
    auctionId: aRef.id,
    buyerUid: TEST_BUYER_UID,
    buyerSnapshot: {
      firstName: profile.firstName ?? 'Test',
      lastInitial: (profile.lastName ?? 'X').charAt(0).toUpperCase(),
    },
    amount,
    createdAt: FieldValue.serverTimestamp(),
    status: 'winning',
  });
  await aRef.update({
    currentBid: amount,
    currentBidderUid: TEST_BUYER_UID,
    bidCount: FieldValue.increment(1),
    updatedAt: FieldValue.serverTimestamp(),
  });
  console.log(`Bid placed: USD ${amount} by ${userSnap.data()?.email}`);

  writeFileSync(STATE_FILE, JSON.stringify({ vehicleId: vRef.id, auctionId: aRef.id, amount }));
  console.log('\nState saved. Wait ~2 minutes, then run:');
  console.log('  node scripts/circuit-test.mjs check');
}

async function check() {
  console.log('=== CHECK ===');
  if (!existsSync(STATE_FILE)) {
    console.error('No state file. Run `setup` first.');
    process.exit(1);
  }
  const { auctionId, vehicleId } = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  const a = (await db.doc(`auctions/${auctionId}`).get()).data();
  const v = (await db.doc(`vehicles/${vehicleId}`).get()).data();

  const ok = (c) => (c ? 'PASS' : 'FAIL');

  console.log('Auction status:', a?.status, '(expect: ended)', ok(a?.status === 'ended'));
  console.log('Outcome:', a?.outcome, '(expect: sold)', ok(a?.outcome === 'sold'));
  console.log('winnerUid:', a?.winnerUid, ok(a?.winnerUid === TEST_BUYER_UID));
  console.log('finalPrice:', a?.finalPrice, ok(a?.finalPrice === 6000));
  console.log('paymentStatus:', a?.paymentStatus, '(expect: pending_payment)', ok(a?.paymentStatus === 'pending_payment'));
  console.log('paymentDeadline set:', !!a?.paymentDeadline, ok(!!a?.paymentDeadline));
  console.log('paymentDepositUsd:', a?.paymentDepositUsd, ok(typeof a?.paymentDepositUsd === 'number'));
  console.log('Vehicle status:', v?.status, '(expect: sold)', ok(v?.status === 'sold'));

  console.log('\n--- Email + notification ---');
  console.log('If status=ended/sold above, sendAuctionWon trigger fired.');
  console.log('Check email delivery in Resend dashboard, and Cloud Logging:');
  console.log('  firebase functions:log --only sendAuctionWon -n 10');
  console.log('The won notification also appears in the buyer bell in real time.');

  if (a?.status !== 'ended') {
    console.log('\nNOT closed yet. tickAuctions runs every 1 min — wait and re-check.');
  }
}

async function cleanup() {
  if (!existsSync(STATE_FILE)) {
    console.log('No state to clean.');
    process.exit(0);
  }
  const { auctionId, vehicleId } = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  // delete bids subcollection
  const bids = await db.collection(`auctions/${auctionId}/bids`).get();
  for (const b of bids.docs) await b.ref.delete();
  await db.doc(`auctions/${auctionId}`).delete().catch(() => {});
  await db.doc(`vehicles/${vehicleId}`).delete().catch(() => {});
  console.log('Cleaned up test auction + vehicle:', auctionId, vehicleId);
}

if (mode === 'setup') await setup();
else if (mode === 'check') await check();
else if (mode === 'cleanup') await cleanup();
else console.log('Usage: node scripts/circuit-test.mjs setup|check|cleanup');
process.exit(0);
