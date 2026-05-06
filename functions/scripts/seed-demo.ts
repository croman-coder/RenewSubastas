import { adminAuth, adminDb } from '../src/lib/admin.js';
import { FieldValue } from 'firebase-admin/firestore';

interface DemoVehicle {
  make: string;
  model: string;
  year: number;
  vin?: string;
  mileage: number;
  transmission: 'manual' | 'automatic' | 'cvt';
  fuelType: 'gasoline' | 'diesel' | 'hybrid' | 'electric';
  color: string;
  condition: 'new' | 'used' | 'damaged';
  descriptionEs: string;
  imageSeeds: string[];
}

const DEMO_VEHICLES: DemoVehicle[] = [
  {
    make: 'Toyota',
    model: 'Corolla',
    year: 2021,
    vin: 'JTDBR32E230012345',
    mileage: 45000,
    transmission: 'automatic',
    fuelType: 'gasoline',
    color: 'Blanco perla',
    condition: 'used',
    descriptionEs:
      'Toyota Corolla 2021 en excelente estado. Único dueño, mantenimientos al día en concesionaria oficial. Cuenta con cámara de retroceso, control crucero y sistema multimedia.',
    imageSeeds: ['toyota-corolla-1', 'toyota-corolla-2', 'toyota-corolla-3'],
  },
  {
    make: 'Honda',
    model: 'Civic',
    year: 2020,
    vin: '2HGFC2F50LH012345',
    mileage: 62000,
    transmission: 'cvt',
    fuelType: 'gasoline',
    color: 'Gris metálico',
    condition: 'used',
    descriptionEs:
      'Honda Civic Touring 2020 con paquete tecnológico completo. Asientos de cuero, techo solar, sensores de estacionamiento. Llantas nuevas instaladas hace 3 meses.',
    imageSeeds: ['honda-civic-1', 'honda-civic-2'],
  },
  {
    make: 'Volkswagen',
    model: 'Amarok',
    year: 2019,
    mileage: 88000,
    transmission: 'automatic',
    fuelType: 'diesel',
    color: 'Negro',
    condition: 'used',
    descriptionEs:
      'VW Amarok V6 Highline 2019. Camioneta 4x4 con tracción full time. Ideal para trabajo o aventura. Bull bar, estribos laterales y lona marítima incluidos.',
    imageSeeds: ['vw-amarok-1', 'vw-amarok-2', 'vw-amarok-3', 'vw-amarok-4'],
  },
  {
    make: 'Tesla',
    model: 'Model 3',
    year: 2022,
    mileage: 18000,
    transmission: 'automatic',
    fuelType: 'electric',
    color: 'Rojo',
    condition: 'used',
    descriptionEs:
      'Tesla Model 3 Long Range 2022. Autonomía 580 km. Autopilot habilitado. Garantía de batería vigente hasta 2030. Cargador portátil incluido.',
    imageSeeds: ['tesla-model3-1', 'tesla-model3-2', 'tesla-model3-3'],
  },
  {
    make: 'Ford',
    model: 'Ranger',
    year: 2018,
    mileage: 120000,
    transmission: 'manual',
    fuelType: 'diesel',
    color: 'Azul oscuro',
    condition: 'used',
    descriptionEs:
      'Ford Ranger XLT 2018. Cabina doble. Cubierta de caja, conexión al diferencial trasero. Listo para trabajar. Precio negociable.',
    imageSeeds: ['ford-ranger-1', 'ford-ranger-2'],
  },
  {
    make: 'Fiat',
    model: 'Cronos',
    year: 2023,
    mileage: 12000,
    transmission: 'automatic',
    fuelType: 'gasoline',
    color: 'Plata',
    condition: 'used',
    descriptionEs:
      'Fiat Cronos Drive 2023 prácticamente nuevo. Único dueño, recibido como parte de pago. Bluetooth, USB, control de tracción.',
    imageSeeds: ['fiat-cronos-1', 'fiat-cronos-2'],
  },
];

function imageUrl(seed: string, size = 1200): string {
  // Free placeholder service — returns a deterministic image per seed.
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${size}/${Math.round(size * 0.75)}`;
}

async function main() {
  const adminEmail = process.argv[2] ?? 'admin@santarosa.com.py';
  const admin = await adminAuth().getUserByEmail(adminEmail);
  console.log(`Using admin uid: ${admin.uid}`);

  const db = adminDb();
  const createdVehicles: { id: string; status: 'draft' | 'ready' | 'in_auction' }[] = [];

  for (let i = 0; i < DEMO_VEHICLES.length; i++) {
    const v = DEMO_VEHICLES[i]!;
    const ref = db.collection('vehicles').doc();
    // First two stay as `ready`. Next 4 will be flipped to `in_auction` after auction creation.
    const status = i < 2 ? 'ready' : 'ready';
    await ref.set({
      id: ref.id,
      make: v.make,
      model: v.model,
      year: v.year,
      ...(v.vin && { vin: v.vin }),
      mileage: v.mileage,
      transmission: v.transmission,
      fuelType: v.fuelType,
      color: v.color,
      condition: v.condition,
      description: { es: v.descriptionEs },
      images: v.imageSeeds.map((seed, order) => ({
        url: imageUrl(seed, 1200),
        thumbnailUrl: imageUrl(seed, 400),
        order,
      })),
      status,
      createdBy: admin.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    createdVehicles.push({ id: ref.id, status });
    console.log(`  vehicle: ${v.make} ${v.model} ${v.year}  → ${ref.id}`);
  }

  // Create auctions for vehicles 2..5 (indices 2,3,4,5) leaving 0 and 1 as 'ready' drafts.
  // Mix of statuses: live (now-2h to now+24h), live closing soon (now-1h to now+30min),
  // scheduled (starts in +12h), ended (now-2d to now-1h).
  const now = Date.now();
  const auctions: Array<{
    vehicleIdx: number;
    startsAtMs: number;
    endsAtMs: number;
    startingPrice: number;
    bidIncrement: number;
    status: 'live' | 'scheduled' | 'ended';
  }> = [
    {
      vehicleIdx: 2,
      startsAtMs: now - 2 * 3600_000,
      endsAtMs: now + 24 * 3600_000,
      startingPrice: 15000,
      bidIncrement: 500,
      status: 'live',
    },
    {
      vehicleIdx: 3,
      startsAtMs: now - 60 * 60_000,
      endsAtMs: now + 30 * 60_000,
      startingPrice: 28000,
      bidIncrement: 1000,
      status: 'live', // closing soon
    },
    {
      vehicleIdx: 4,
      startsAtMs: now + 12 * 3600_000,
      endsAtMs: now + 36 * 3600_000,
      startingPrice: 9500,
      bidIncrement: 250,
      status: 'scheduled',
    },
    {
      vehicleIdx: 5,
      startsAtMs: now - 2 * 24 * 3600_000,
      endsAtMs: now - 60 * 60_000,
      startingPrice: 12000,
      bidIncrement: 500,
      status: 'ended',
    },
  ];

  for (const a of auctions) {
    const v = DEMO_VEHICLES[a.vehicleIdx]!;
    const vehicleId = createdVehicles[a.vehicleIdx]!.id;
    const auctionRef = db.collection('auctions').doc();
    await auctionRef.set({
      id: auctionRef.id,
      vehicleId,
      vehicleSnapshot: {
        make: v.make,
        model: v.model,
        year: v.year,
        thumbnailUrl: imageUrl(v.imageSeeds[0]!, 400),
      },
      startingPrice: a.startingPrice,
      bidIncrement: a.bidIncrement,
      startsAt: new Date(a.startsAtMs),
      endsAt: new Date(a.endsAtMs),
      currentBid: 0,
      bidCount: 0,
      status: a.status,
      ...(a.status === 'ended' && { outcome: 'no_bids' }),
      createdBy: admin.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    // Flip the vehicle to in_auction (or sold for ended).
    await db.doc(`vehicles/${vehicleId}`).update({
      status: a.status === 'ended' ? 'archived' : 'in_auction',
      updatedAt: FieldValue.serverTimestamp(),
    });
    console.log(`  auction: ${v.make} ${v.model} ${v.year}  → ${auctionRef.id}  [${a.status}]`);
  }

  console.log(`\nDone. ${DEMO_VEHICLES.length} vehicles, ${auctions.length} auctions.`);
  console.log('Vehicles 0 and 1 left as "ready" so you can manually create auctions.');
  console.log('To wipe demo data: delete the .emulator-data directory and re-run pnpm seed.');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
