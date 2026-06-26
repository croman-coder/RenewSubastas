// Sets up data for a manual/browser UI test of the bidding flow against the
// emulators: two retail buyers with known passwords and one LIVE retail
// auction (with audience set, so the buyer catalog shows it).
//   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
//   GCLOUD_PROJECT=carbid-staging pnpm exec tsx scripts/e2e-ui-setup.ts
import { adminAuth, adminDb } from '../src/lib/admin.js';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

const PASSWORD = 'Buyer123!';

async function ensureBuyer(email: string, firstName: string): Promise<string> {
  let uid: string;
  try {
    const u = await adminAuth().getUserByEmail(email);
    uid = u.uid;
    await adminAuth().updateUser(uid, { password: PASSWORD, emailVerified: true });
  } catch {
    const u = await adminAuth().createUser({
      email,
      password: PASSWORD,
      emailVerified: true,
      displayName: firstName,
    });
    uid = u.uid;
  }
  await adminAuth().setCustomUserClaims(uid, {
    role: 'buyer',
    status: 'active',
    audience: 'retail',
  });
  await adminDb()
    .doc(`users/${uid}`)
    .set({
      uid,
      role: 'buyer',
      email,
      status: 'active',
      profile: {
        firstName,
        lastName: 'Test',
        documentType: 'CI',
        documentNumber: '1234567',
        phone: '+595971000000',
        audience: 'retail',
      },
      preferences: { locale: 'es', theme: 'system', notifications: {} },
      createdBy: 'e2e-ui',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  return uid;
}

async function main() {
  const uidA = await ensureBuyer('comprador1@test.com', 'Comprador1');
  const uidB = await ensureBuyer('comprador2@test.com', 'Comprador2');

  const vehicleId = 'v-ui-e2e';
  await adminDb().doc(`vehicles/${vehicleId}`).set({
    id: vehicleId,
    make: 'Honda',
    model: 'Civic',
    year: 2020,
    audience: 'retail',
    status: 'in_auction',
    licensePlate: 'UI-E2E',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const aRef = adminDb().collection('auctions').doc('ui-e2e-auction');
  await aRef.set({
    id: aRef.id,
    vehicleId,
    vehicleSnapshot: { make: 'Honda', model: 'Civic', year: 2020 },
    audience: 'retail',
    startingPrice: 8000,
    bidIncrement: 500,
    startsAt: Timestamp.fromMillis(Date.now() - 60_000),
    endsAt: Timestamp.fromMillis(Date.now() + 3600_000),
    currentBid: 0,
    bidCount: 0,
    status: 'live',
    createdBy: 'e2e-ui',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  console.log('Listo para test de UI:');
  console.log(`  Comprador1: comprador1@test.com / ${PASSWORD} (uid ${uidA})`);
  console.log(`  Comprador2: comprador2@test.com / ${PASSWORD} (uid ${uidB})`);
  console.log(`  Subasta retail LIVE: ${aRef.id} (Honda Civic 2020, base 8000, incremento 500)`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
