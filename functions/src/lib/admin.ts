import { initializeApp, getApps, applicationDefault, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

let app: App | null = null;

export function getAdminApp(): App {
  if (!app) {
    if (getApps().length) {
      app = getApps()[0]!;
    } else {
      app = initializeApp({ credential: applicationDefault() });
    }
  }
  return app;
}

export const adminAuth = (): Auth => getAuth(getAdminApp());
export const adminDb = (): Firestore => getFirestore(getAdminApp());
