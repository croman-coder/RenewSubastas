import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore';
import { getStorage, connectStorageEmulator, type FirebaseStorage } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator, type Functions } from 'firebase/functions';
import type { FirebaseEnv } from './env';

let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;
let storageInstance: FirebaseStorage | null = null;
let functionsInstance: Functions | null = null;

export function initFirebaseClient(env: FirebaseEnv): {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
  functions: Functions;
} {
  if (!appInstance) {
    appInstance = getApps().length
      ? getApp()
      : initializeApp({
          apiKey: env.apiKey,
          authDomain: env.authDomain,
          projectId: env.projectId,
          storageBucket: env.storageBucket,
          messagingSenderId: env.messagingSenderId,
          appId: env.appId,
          ...(env.measurementId !== undefined && { measurementId: env.measurementId }),
        });

    authInstance = getAuth(appInstance);
    dbInstance = getFirestore(appInstance);
    storageInstance = getStorage(appInstance);
    functionsInstance = getFunctions(appInstance, 'us-central1');

    if (env.useEmulators && typeof window !== 'undefined') {
      connectAuthEmulator(authInstance, 'http://127.0.0.1:9099', { disableWarnings: true });
      connectFirestoreEmulator(dbInstance, '127.0.0.1', 8080);
      connectStorageEmulator(storageInstance, '127.0.0.1', 9199);
      connectFunctionsEmulator(functionsInstance, '127.0.0.1', 5001);
    }
  }
  return {
    app: appInstance!,
    auth: authInstance!,
    db: dbInstance!,
    storage: storageInstance!,
    functions: functionsInstance!,
  };
}
