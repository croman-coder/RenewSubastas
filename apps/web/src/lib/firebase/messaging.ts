'use client';
import { getMessaging, getToken, onMessage, type Messaging } from 'firebase/messaging';
import { httpsCallable } from 'firebase/functions';
import { fb } from './client';

/**
 * Register the FCM service worker with the SDK config embedded as a
 * query string. The SW lives at the site root (`/firebase-messaging-sw.js`)
 * because Firebase requires that exact path; it reads `apiKey`,
 * `projectId`, etc. from `self.location.search` so we don't have to
 * inline a static config into a file shipped via `public/` (which would
 * leak across deployments and miss per-environment overrides).
 */
async function registerSw(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  const params = new URLSearchParams({
    apiKey: process.env['NEXT_PUBLIC_FIREBASE_API_KEY'] ?? '',
    authDomain: process.env['NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'] ?? '',
    projectId: process.env['NEXT_PUBLIC_FIREBASE_PROJECT_ID'] ?? '',
    storageBucket: process.env['NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET'] ?? '',
    messagingSenderId: process.env['NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'] ?? '',
    appId: process.env['NEXT_PUBLIC_FIREBASE_APP_ID'] ?? '',
  });
  try {
    const reg = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${params}`, {
      scope: '/',
    });
    // getToken -> PushManager.subscribe needs an ACTIVE service worker. Right
    // after register() the worker is usually still 'installing'/'waiting', so
    // subscribe throws "no active Service Worker". Wait until it's active.
    if (!reg.active) {
      await waitForActive(reg);
    }
    return reg;
  } catch (err) {
    console.warn('[messaging] SW registration failed', err);
    return null;
  }
}

function waitForActive(reg: ServiceWorkerRegistration): Promise<void> {
  return new Promise((resolve) => {
    // Already active by the time we check.
    if (reg.active) return resolve();
    const sw = reg.installing ?? reg.waiting;
    if (!sw) {
      // Fall back to the global ready promise (resolves once an active worker
      // controls the page).
      void navigator.serviceWorker.ready.then(() => resolve());
      return;
    }
    const onChange = () => {
      if (sw.state === 'activated') {
        sw.removeEventListener('statechange', onChange);
        resolve();
      }
    };
    sw.addEventListener('statechange', onChange);
    // Safety timeout so we never hang the opt-in flow forever.
    setTimeout(resolve, 5000);
  });
}

let cached: Messaging | null = null;
function getClient(): Messaging | null {
  if (typeof window === 'undefined') return null;
  if (!cached) {
    try {
      cached = getMessaging(fb.app);
    } catch (err) {
      console.warn('[messaging] getMessaging failed', err);
      return null;
    }
  }
  return cached;
}

/**
 * Browser feature gate. FCM web push requires Notification + Service
 * Workers + Push API. We expose this so the UI can hide the opt-in
 * button on environments that don't support push (Safari < 16.4,
 * private windows in some browsers).
 */
export function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
}

/**
 * Returns the current Notification permission state — used by the
 * permission prompt to decide whether to show a "request access" CTA
 * or a "you've already enabled it" badge.
 */
export function pushPermission(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

/**
 * Request permission, obtain an FCM token, and persist it server-side
 * so a Cloud Function can later fan a push out to this device. Returns
 * `null` if the user denies permission or the environment doesn't
 * support web push — caller treats that as "no push" and falls back to
 * in-app notifications.
 */
export async function enablePush(): Promise<string | null> {
  if (!isPushSupported()) return null;
  const messaging = getClient();
  if (!messaging) return null;

  const vapidKey = process.env['NEXT_PUBLIC_FIREBASE_VAPID_KEY'];
  if (!vapidKey) {
    console.warn('[messaging] NEXT_PUBLIC_FIREBASE_VAPID_KEY is not set');
    return null;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;

  const sw = await registerSw();
  if (!sw) return null;

  try {
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: sw,
    });
    if (!token) return null;

    // Persist the token so the backend can fan out push messages. The
    // callable enforces auth + dedupes; we don't keep a local registry.
    await httpsCallable<{ token: string }, { ok: true }>(fb.functions, 'savePushToken')({ token });

    return token;
  } catch (err) {
    console.warn('[messaging] getToken failed', err);
    return null;
  }
}

/**
 * Wire a foreground listener that surfaces FCM payloads while the tab
 * is focused. By default Firebase suppresses notifications when the
 * page is open, so we get the raw payload here and let the caller
 * decide how to display it (toast, badge bump, etc.).
 */
export function onForegroundPush(
  handler: (p: { title: string; body: string; url?: string }) => void,
): () => void {
  const messaging = getClient();
  if (!messaging) return () => {};
  return onMessage(messaging, (payload) => {
    const title = payload.notification?.title || payload.data?.['title'] || 'Renew Subastas';
    const body =
      payload.notification?.body || payload.data?.['body'] || 'Nueva actividad en tu cuenta.';
    const url = payload.fcmOptions?.link || payload.data?.['url'];
    handler({ title, body, ...(url ? { url } : {}) });
  });
}
