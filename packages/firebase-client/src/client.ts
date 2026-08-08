import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  connectAuthEmulator,
  browserLocalPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
  browserPopupRedirectResolver,
  type Auth,
} from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore';
import { getStorage, connectStorageEmulator, type FirebaseStorage } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator, type Functions } from 'firebase/functions';
import type { FirebaseEnv } from './env';

let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;
let storageInstance: FirebaseStorage | null = null;
let functionsInstance: Functions | null = null;

/**
 * Builds the Auth instance with localStorage ahead of IndexedDB.
 *
 * The browser default is IndexedDB first, and Instagram's iOS in-app WebView
 * breaks it: it tears down the object store under a live handle and aborts
 * transactions when the app is backgrounded, producing
 * `InvalidStateError: Object store cannot be found` and
 * `AbortError: The operation was aborted`. Firebase reads persistence during
 * init from a promise its own code marks `no-floating-promises`, so there is
 * no call site here that could catch it — every one of those visits threw an
 * unhandled rejection into Sentry. They arrive on ad landings
 * (utm_source=ig), so it is a steady share of paid traffic, not a fluke.
 *
 * browserLocalPersistence is a synchronous localStorage read wrapped in a
 * resolved promise: no multi-step transaction, nothing to abort. The chain
 * falls through to sessionStorage and finally in-memory, which is also what
 * makes this safe during SSR — this module is 'use client', but Next still
 * evaluates it while prerendering, and there _isAvailable() is false for the
 * first two so in-memory wins.
 *
 * popupRedirectResolver has to be passed explicitly: getAuth() registers it
 * for you, initializeAuth() does not, and without it the Google button's
 * signInWithPopup throws auth/argument-error.
 *
 * Falls back to getAuth() if auth was already initialized for this app (HMR,
 * or a second initializer appearing later) — initializeAuth throws
 * auth/already-initialized in that case, and a hard crash at module scope
 * would take the whole page down.
 */
function initAuth(app: FirebaseApp): Auth {
  try {
    return initializeAuth(app, {
      persistence: [browserLocalPersistence, browserSessionPersistence, inMemoryPersistence],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch {
    return getAuth(app);
  }
}

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

    authInstance = initAuth(appInstance);
    dbInstance = getFirestore(appInstance);
    storageInstance = getStorage(appInstance);
    functionsInstance = getFunctions(appInstance, 'us-central1');

    if (env.useEmulators && typeof window !== 'undefined') {
      connectAuthEmulator(authInstance, 'http://127.0.0.1:9099', { disableWarnings: true });
      connectFirestoreEmulator(dbInstance, '127.0.0.1', 8080);
      connectStorageEmulator(storageInstance, '127.0.0.1', 9199);
      connectFunctionsEmulator(functionsInstance, '127.0.0.1', 5002);
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
