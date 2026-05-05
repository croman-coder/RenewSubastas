import { randomBytes } from 'crypto';
import { adminAuth, adminDb } from '../src/lib/admin.js';
import { setUserClaims } from '../src/lib/claims.js';
import { FieldValue } from 'firebase-admin/firestore';

async function main() {
  const email = process.argv[2];
  const firstName = process.argv[3] ?? 'Admin';
  const lastName = process.argv[4] ?? 'CARBID';
  const documentNumber = process.argv[5] ?? '0000000';
  // Optional 6th arg: password. If provided, sets it directly (no reset link round-trip).
  const password = process.argv[6];

  if (!email) {
    throw new Error(
      'Usage: bootstrap-admin <email> [firstName] [lastName] [documentNumber] [password]',
    );
  }

  let user;
  try {
    user = await adminAuth().getUserByEmail(email);
  } catch {
    user = await adminAuth().createUser({
      email,
      password: password ?? randomBytes(16).toString('base64url') + 'Aa1!',
      displayName: `${firstName} ${lastName}`,
      emailVerified: true,
    });
  }

  // If user already existed and a password was provided, update it.
  if (password) {
    await adminAuth().updateUser(user.uid, { password, emailVerified: true });
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

  if (password) {
    console.log(`Admin ready. Login: ${email} / ${password}`);
  } else {
    const link = await adminAuth().generatePasswordResetLink(email);
    console.log('Admin bootstrapped. Reset link:', link);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
