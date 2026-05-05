import { adminAuth, adminDb } from '../src/lib/admin.js';
import { setUserClaims } from '../src/lib/claims.js';
import { FieldValue } from 'firebase-admin/firestore';

async function main() {
  const email = process.argv[2];
  const firstName = process.argv[3] ?? 'Admin';
  const lastName = process.argv[4] ?? 'CARBID';
  const documentNumber = process.argv[5] ?? '0000000';
  if (!email) {
    throw new Error('Usage: bootstrap-admin <email> [firstName] [lastName] [documentNumber]');
  }

  let user;
  try {
    user = await adminAuth().getUserByEmail(email);
  } catch {
    user = await adminAuth().createUser({
      email,
      password: Math.random().toString(36).slice(2) + 'Aa1!',
      displayName: `${firstName} ${lastName}`,
      emailVerified: false,
    });
  }

  await setUserClaims(user.uid, { role: 'admin', status: 'active' });

  await adminDb()
    .doc(`users/${user.uid}`)
    .set(
      {
        uid: user.uid,
        role: 'admin',
        email,
        status: 'active',
        profile: { firstName, lastName, documentType: 'CI', documentNumber },
        preferences: {
          locale: 'es',
          theme: 'system',
          notifications: { outbidEmail: true, auctionWonEmail: true, newAuctionEmail: false },
        },
        createdBy: 'bootstrap',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

  const link = await adminAuth().generatePasswordResetLink(email);
  console.log('Admin bootstrapped. Reset link:', link);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
