// Crea N compradores de prueba en el emulador y devuelve sus ID tokens, uno
// por línea de un array JSON, para alimentar la prueba de carga de k6
// (load-test/hot-auction-bids.js). Son compradores DISTINTOS a propósito:
// placeBid rechaza que alguien se supere a sí mismo, así que 100 tokens del
// mismo usuario no medirían nada.
//
//   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
//   GCLOUD_PROJECT=carbid-staging pnpm exec tsx scripts/mint-load-tokens.ts 100 > /tmp/tokens.json
//
// SÓLO emulador: aborta si FIRESTORE_EMULATOR_HOST no está seteado, por la
// misma razón que el seed de demo — no crear usuarios de mentira en el Auth
// real de producción.
import { adminAuth, adminDb } from '../src/lib/admin.js';
import { setUserClaims } from '../src/lib/claims.js';
import { FieldValue } from 'firebase-admin/firestore';

if (!process.env['FIRESTORE_EMULATOR_HOST'] || !process.env['FIREBASE_AUTH_EMULATOR_HOST']) {
  console.error('REFUSING TO RUN: emuladores no configurados. Levantá `pnpm emulators` primero.');
  process.exit(1);
}

const N = Math.max(1, Math.min(500, Number(process.argv[2] ?? '100')));
const PROJECT = process.env['GCLOUD_PROJECT'] ?? 'carbid-staging';
const AUTH_HOST = process.env['FIREBASE_AUTH_EMULATOR_HOST'];

/** Cambia un custom token por un ID token contra el emulador de Auth. */
async function exchange(customToken: string): Promise<string> {
  const res = await fetch(
    `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  const body = (await res.json()) as { idToken?: string; error?: unknown };
  if (!body.idToken) throw new Error(`no idToken: ${JSON.stringify(body.error)}`);
  return body.idToken;
}

async function main() {
  const tokens: string[] = [];
  for (let i = 0; i < N; i++) {
    const uid = `load-buyer-${i}`;
    const email = `load-buyer-${i}@carga.test`;
    try {
      await adminAuth().getUser(uid);
    } catch {
      await adminAuth().createUser({ uid, email, emailVerified: true });
    }
    // placeBid exige un doc de usuario con perfil completo, o rechaza con
    // "profile incomplete"; se siembra el mínimo que ese chequeo requiere.
    await adminDb()
      .doc(`users/${uid}`)
      .set(
        {
          uid,
          email,
          role: 'buyer',
          status: 'active',
          provider: 'password',
          profile: {
            firstName: `Carga${i}`,
            lastName: 'Test',
            phone: '0981123456',
            documentId: '1234567',
            audience: 'retail',
          },
          createdBy: 'seed:load',
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    await setUserClaims(uid, { role: 'buyer', status: 'active', audience: 'retail' });
    const custom = await adminAuth().createCustomToken(uid, {
      role: 'buyer',
      status: 'active',
      audience: 'retail',
    });
    tokens.push(await exchange(custom));
    if ((i + 1) % 20 === 0) console.error(`  ${i + 1}/${N} tokens`);
  }
  // Sólo el JSON va a stdout, para poder redirigir a un archivo limpio; el
  // progreso va a stderr.
  console.error(`Listo: ${tokens.length} tokens (proyecto ${PROJECT}).`);
  process.stdout.write(JSON.stringify(tokens));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
