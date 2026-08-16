// Builds a complete, self-contained Renew Subastas for recording demo videos,
// against the EMULATORS ONLY.
//
//   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
//   GCLOUD_PROJECT=carbid-staging pnpm exec tsx scripts/seed-demo-video.ts
//
// Why the emulators and not a "demo mode" in production: the separation has to
// be physical, not conditional. Here the database is a different database, so
// no demo bid can reach a real auction, no scheduler can close one, and the
// Resend key is the dummy in functions/.secret.local, so no email leaves the
// machine. A flag inside production would be one bad `if` away from a real
// buyer getting an email about a car that does not exist.
//
// REFUSES TO RUN without FIRESTORE_EMULATOR_HOST set. That guard is the whole
// safety story — do not remove it.
//
// Every auction state the video might need exists after this runs, so the
// recording never waits on a scheduler: one about to open, one wide open, one
// with a Compra ya price, one already contested, one won by the demo buyer,
// and one that closed without meeting its reserve.
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '../src/lib/admin.js';
import { setUserClaims } from '../src/lib/claims.js';
import { DEMO_VEHICLES, imageUrl } from './demo-fixtures.js';

if (!process.env['FIRESTORE_EMULATOR_HOST']) {
  console.error(
    'REFUSING TO RUN: FIRESTORE_EMULATOR_HOST is not set.\n' +
      'This script writes fake users, vehicles and auctions. Against the real\n' +
      'project that is production data. Start the emulators first:\n' +
      '  pnpm emulators',
  );
  process.exit(1);
}

const PASSWORD = 'Demo123456';

interface DemoUser {
  email: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'staff' | 'buyer';
  audience: 'retail' | 'wholesale' | null;
  note: string;
}

const USERS: DemoUser[] = [
  {
    email: 'demo.admin@renew.test',
    firstName: 'Ana',
    lastName: 'Admin',
    role: 'admin',
    audience: null,
    note: 'Panel completo: usuarios, configuración, finanzas',
  },
  {
    email: 'demo.staff@renew.test',
    firstName: 'Sergio',
    lastName: 'Staff',
    role: 'staff',
    audience: null,
    note: 'Carga de vehículos y subastas, marcar VENDIDO',
  },
  {
    email: 'demo.comprador@renew.test',
    firstName: 'Carla',
    lastName: 'Compradora',
    role: 'buyer',
    audience: 'retail',
    note: 'Protagonista del video: puja, gana, paga',
  },
  {
    email: 'demo.rival@renew.test',
    firstName: 'Rodrigo',
    lastName: 'Rival',
    role: 'buyer',
    audience: 'retail',
    note: 'Segundo postor, para mostrar "te superaron"',
  },
  {
    email: 'demo.mayorista@renew.test',
    firstName: 'Marta',
    lastName: 'Mayorista',
    role: 'buyer',
    audience: 'wholesale',
    note: 'Catálogo mayorista (no ve las subastas retail)',
  },
];

/**
 * Creates the Auth account and the users/{uid} document together.
 *
 * Writes claims directly rather than waiting for onUserSync: the emulator
 * fires that trigger too, but a script that finishes before the trigger does
 * would print credentials for an account that cannot sign in yet.
 *
 * Idempotent — re-running resets the password instead of failing, so the
 * script can be run again mid-recording without wiping anything.
 */
async function ensureUser(u: DemoUser): Promise<string> {
  let uid: string;
  try {
    const existing = await adminAuth().getUserByEmail(u.email);
    uid = existing.uid;
    await adminAuth().updateUser(uid, { password: PASSWORD, emailVerified: true });
  } catch {
    const created = await adminAuth().createUser({
      email: u.email,
      password: PASSWORD,
      emailVerified: true,
      displayName: `${u.firstName} ${u.lastName}`,
    });
    uid = created.uid;
  }

  await adminDb()
    .doc(`users/${uid}`)
    .set(
      {
        uid,
        email: u.email,
        role: u.role,
        status: 'active',
        provider: 'password',
        profile: {
          firstName: u.firstName,
          lastName: u.lastName,
          phone: '0981123456',
          documentId: '1234567',
          ...(u.audience && { audience: u.audience }),
        },
        preferences: {
          locale: 'es',
          theme: 'system',
          // Off across the board. The emulator cannot send mail anyway (the
          // Resend key is a dummy), but leaving these on would light up the
          // notification bell mid-recording.
          notifications: { outbidEmail: false, auctionWonEmail: false, newAuctionEmail: false },
        },
        createdBy: 'seed:demo-video',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

  await setUserClaims(uid, {
    role: u.role,
    status: 'active',
    ...(u.audience && { audience: u.audience }),
  });
  return uid;
}

interface DemoAuction {
  vehicleIdx: number;
  label: string;
  audience: 'retail' | 'wholesale';
  startsAtMs: number;
  endsAtMs: number;
  startingPrice: number;
  bidIncrement: number;
  reservePrice?: number;
  buyNowPrice?: number;
  status: 'scheduled' | 'live' | 'ended';
  /** Bids to plant, oldest first. Index into USERS. */
  bids?: { userIdx: number; amount: number }[];
  outcome?: 'sold' | 'reserve_not_met' | 'no_bids';
  winnerIdx?: number;
}

async function main() {
  const now = Date.now();
  const h = 3600_000;

  console.log('Usuarios');
  const uids: string[] = [];
  for (const u of USERS) {
    const uid = await ensureUser(u);
    uids.push(uid);
    console.log(`  ${u.email.padEnd(28)} ${u.role.padEnd(6)} ${uid}`);
  }

  const admin = uids[0]!;
  const db = adminDb();

  // Vehicles: one document per fixture, all reusable across runs by id so a
  // second run updates rather than piling up duplicates in the catalog.
  const vehicleIds: string[] = [];
  for (let i = 0; i < DEMO_VEHICLES.length; i++) {
    const v = DEMO_VEHICLES[i]!;
    const id = `demo-vehicle-${i}`;
    await db.doc(`vehicles/${id}`).set(
      {
        id,
        make: v.make,
        model: v.model,
        year: v.year,
        ...(v.vin && { vin: v.vin }),
        mileage: v.mileage,
        transmission: v.transmission,
        fuelType: v.fuelType,
        color: v.color,
        condition: v.condition,
        audience: 'retail',
        description: { es: v.descriptionEs },
        images: v.imageSeeds.map((seed, order) => ({
          url: imageUrl(seed, 1200),
          thumbnailUrl: imageUrl(seed, 400),
          order,
        })),
        status: 'in_auction',
        createdBy: admin,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    vehicleIds.push(id);
  }

  const auctions: DemoAuction[] = [
    {
      vehicleIdx: 0,
      label: 'Por comenzar (en 2 h)',
      audience: 'retail',
      startsAtMs: now + 2 * h,
      endsAtMs: now + 26 * h,
      startingPrice: 14000,
      bidIncrement: 500,
      status: 'scheduled',
    },
    {
      vehicleIdx: 1,
      label: 'En vivo, sin pujas — para la primera puja del video',
      audience: 'retail',
      // Six hours is deliberate: long enough that the countdown never runs out
      // mid-take, short enough that the page still reads as urgent on camera.
      startsAtMs: now - h,
      endsAtMs: now + 6 * h,
      startingPrice: 9000,
      bidIncrement: 250,
      status: 'live',
    },
    {
      vehicleIdx: 2,
      label: 'En vivo con Compra ya — botón visible mientras no haya pujas',
      audience: 'retail',
      startsAtMs: now - h,
      endsAtMs: now + 6 * h,
      startingPrice: 15000,
      bidIncrement: 500,
      reservePrice: 17000,
      buyNowPrice: 21000,
      status: 'live',
    },
    {
      vehicleIdx: 3,
      label: 'En vivo con pujas — Carla va ganando, Rodrigo la superó antes',
      audience: 'retail',
      startsAtMs: now - 3 * h,
      endsAtMs: now + 5 * h,
      startingPrice: 26000,
      bidIncrement: 1000,
      status: 'live',
      bids: [
        { userIdx: 2, amount: 27000 },
        { userIdx: 3, amount: 28000 },
        { userIdx: 2, amount: 29000 },
      ],
    },
    {
      vehicleIdx: 4,
      label: 'Adjudicada a Carla — pantalla de ganada y pago de seña',
      audience: 'retail',
      startsAtMs: now - 30 * h,
      endsAtMs: now - h,
      startingPrice: 11000,
      bidIncrement: 500,
      status: 'ended',
      bids: [
        { userIdx: 3, amount: 11500 },
        { userIdx: 2, amount: 12500 },
      ],
      outcome: 'sold',
      winnerIdx: 2,
    },
    {
      vehicleIdx: 5,
      label: 'Cerrada sin alcanzar la reserva',
      audience: 'retail',
      startsAtMs: now - 30 * h,
      endsAtMs: now - 2 * h,
      startingPrice: 8000,
      bidIncrement: 250,
      reservePrice: 20000,
      status: 'ended',
      bids: [{ userIdx: 3, amount: 8250 }],
      outcome: 'reserve_not_met',
    },
  ];

  console.log('\nSubastas');
  for (let i = 0; i < auctions.length; i++) {
    const a = auctions[i]!;
    const v = DEMO_VEHICLES[a.vehicleIdx]!;
    const id = `demo-auction-${i}`;
    const ref = db.doc(`auctions/${id}`);

    const lastBid = a.bids?.[a.bids.length - 1];
    const winnerUid = a.winnerIdx !== undefined ? uids[a.winnerIdx] : null;

    await ref.set(
      {
        id,
        vehicleId: vehicleIds[a.vehicleIdx],
        audience: a.audience,
        vehicleSnapshot: {
          make: v.make,
          model: v.model,
          year: v.year,
          thumbnailUrl: imageUrl(v.imageSeeds[0]!, 400),
        },
        startingPrice: a.startingPrice,
        bidIncrement: a.bidIncrement,
        ...(a.reservePrice !== undefined && { reservePrice: a.reservePrice }),
        ...(a.buyNowPrice !== undefined && { buyNowPrice: a.buyNowPrice }),
        startsAt: Timestamp.fromMillis(a.startsAtMs),
        endsAt: Timestamp.fromMillis(a.endsAtMs),
        currentBid: lastBid?.amount ?? 0,
        ...(lastBid && { currentBidderUid: uids[lastBid.userIdx] }),
        bidCount: a.bids?.length ?? 0,
        status: a.status,
        ...(a.outcome && { outcome: a.outcome }),
        ...(winnerUid && { winnerUid, finalPrice: lastBid?.amount ?? 0 }),
        // A won auction needs a payment state or the "ganada" screen has
        // nothing to ask the buyer for.
        ...(a.outcome === 'sold' && {
          paymentStatus: 'pending',
          paymentDeadline: Timestamp.fromMillis(now + 48 * h),
        }),
        createdBy: admin,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    // Bid history, so "PUJAS EN VIVO" is populated on camera rather than empty.
    for (let b = 0; b < (a.bids?.length ?? 0); b++) {
      const bid = a.bids![b]!;
      const u = USERS[bid.userIdx]!;
      await ref
        .collection('bids')
        .doc(`demo-bid-${b}`)
        .set({
          auctionId: id,
          buyerUid: uids[bid.userIdx],
          buyerSnapshot: { firstName: u.firstName, lastInitial: u.lastName.charAt(0) },
          amount: bid.amount,
          createdAt: Timestamp.fromMillis(a.startsAtMs + (b + 1) * 600_000),
        });
    }

    console.log(`  ${id}  ${(v.make + ' ' + v.model).padEnd(22)} ${a.label}`);
  }

  console.log(`\nContraseña para todos: ${PASSWORD}`);
  console.log('Sitio: http://localhost:3100  (pnpm dev:web, con los emuladores arriba)');
  console.log('Nada de esto toca renewsubastas.com.py: es otra base de datos.');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
