/**
 * One Admin SDK app for the whole mirror, with the project-id guard.
 *
 * Credentials come from GOOGLE_APPLICATION_CREDENTIALS (a JSON key) or, when
 * running against the emulators, from nothing at all (the emulator hosts in
 * the environment make the SDK skip auth). The guard exists because the
 * mirror is meant to run on a server with a READ-ONLY service account for
 * `carbid-staging`; pointing it, by mistake, at the owner key of some other
 * project would still "work" and quietly mirror the wrong thing.
 */
import { initializeApp, getApps, applicationDefault, cert, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getStorage, type Storage } from 'firebase-admin/storage';
import { readFileSync } from 'node:fs';

let app: App | undefined;

export function initFirebase(projectId: string, storageBucket: string): App {
  if (app) return app;
  if (getApps().length) {
    app = getApps()[0]!;
    return app;
  }
  const keyPath = process.env['GOOGLE_APPLICATION_CREDENTIALS'];
  const emulated = Boolean(process.env['FIRESTORE_EMULATOR_HOST']);

  if (keyPath) {
    const sa = JSON.parse(readFileSync(keyPath, 'utf8')) as { project_id?: string };
    if (sa.project_id !== projectId) {
      throw new Error(
        `La clave en GOOGLE_APPLICATION_CREDENTIALS es del proyecto "${sa.project_id}", ` +
          `pero MIRROR_PROJECT_ID dice "${projectId}". No arranco.`,
      );
    }
    app = initializeApp({ credential: cert(keyPath), projectId, storageBucket });
  } else if (emulated) {
    app = initializeApp({ projectId, storageBucket });
  } else {
    app = initializeApp({ credential: applicationDefault(), projectId, storageBucket });
  }
  return app;
}

export const db = (): Firestore => getFirestore(app!);
export const auth = (): Auth => getAuth(app!);
export const storage = (): Storage => getStorage(app!);
