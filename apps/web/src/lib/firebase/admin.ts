import 'server-only';
import { initializeApp, getApps, cert, applicationDefault, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { serverEnv } from '../env.server';

let app: App | null = null;

export function getAdminApp(): App {
  if (!app) {
    if (getApps().length) {
      app = getApps()[0]!;
    } else if (serverEnv.FIREBASE_AUTH_EMULATOR_HOST) {
      app = initializeApp({ projectId: serverEnv.FIREBASE_PROJECT_ID });
    } else if (serverEnv.FIREBASE_SERVICE_ACCOUNT_KEY) {
      // Robust path for hosts that mangle PEM newlines: store full SA JSON as base64.
      const json = JSON.parse(
        Buffer.from(serverEnv.FIREBASE_SERVICE_ACCOUNT_KEY, 'base64').toString('utf8'),
      ) as { project_id: string; client_email: string; private_key: string };
      app = initializeApp({
        credential: cert({
          projectId: json.project_id,
          clientEmail: json.client_email,
          privateKey: json.private_key,
        }),
      });
    } else if (serverEnv.FIREBASE_CLIENT_EMAIL && serverEnv.FIREBASE_PRIVATE_KEY) {
      app = initializeApp({
        credential: cert({
          projectId: serverEnv.FIREBASE_PROJECT_ID,
          clientEmail: serverEnv.FIREBASE_CLIENT_EMAIL,
          privateKey: serverEnv.FIREBASE_PRIVATE_KEY,
        }),
      });
    } else {
      app = initializeApp({ credential: applicationDefault() });
    }
  }
  return app;
}

export const adminAuth = (): Auth => getAuth(getAdminApp());
