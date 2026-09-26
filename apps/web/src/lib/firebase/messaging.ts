'use client';
import { getMessaging, getToken, onMessage, isSupported, type Messaging } from 'firebase/messaging';
import { httpsCallable } from 'firebase/functions';
import * as Sentry from '@sentry/nextjs';
import { ensureClientAuth } from '@/lib/auth/ensure-client-auth';
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

let clientPromise: Promise<Messaging | null> | null = null;

/**
 * Resolve the Messaging instance, or `null` on a browser that can't do web
 * push.
 *
 * This MUST await the SDK's own async `isSupported()` before touching
 * `getMessaging()`. `getMessaging()` fires that same probe internally on a
 * DETACHED promise chain and `throw`s inside its `.then()` callback when it
 * fails (see `getMessagingInWindow` in @firebase/messaging). Because the
 * throw happens asynchronously, outside the synchronous call frame, a
 * `try/catch` wrapped around `getMessaging()` cannot intercept it — the
 * rejection escapes to `window.onunhandledrejection` and surfaces as an
 * uncaught `messaging/unsupported-browser` error. That's exactly what was
 * hitting Chrome/iOS in production, where WebKit only exposes the Push API
 * to home-screen-installed PWAs (iOS 16.4+), so `isSupported()` is false in
 * an ordinary tab.
 *
 * The probe result is memoised: it hits IndexedDB, and every caller wants
 * the same answer for the life of the page.
 */
function getClient(): Promise<Messaging | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (!clientPromise) {
    clientPromise = (async () => {
      try {
        if (!(await isSupported())) return null;
        return getMessaging(fb.app);
      } catch (err) {
        console.warn('[messaging] unavailable in this browser', err);
        return null;
      }
    })();
  }
  return clientPromise;
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
 * Why enabling push did not work, as far as the buyer needs to know:
 *   - `unsupported` — this browser can't do web push at all.
 *   - `denied`      — the site is blocked in the browser settings.
 *   - `dismissed`   — the browser asked and the buyer closed it without allowing.
 *   - `session`     — no Firebase user in this browser and the server session
 *                     couldn't restore one (expired / revoked).
 *   - `failed`      — anything else (service worker, FCM, our backend). Also
 *                     reported to Sentry with the step that broke.
 */
export type EnablePushResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'unsupported' | 'denied' | 'dismissed' | 'session' | 'failed' };

function failed(step: string, err?: unknown): EnablePushResult {
  console.warn(`[messaging] ${step} failed`, err);
  Sentry.captureException(err ?? new Error(`push: ${step} failed`), {
    tags: { feature: 'push', step },
  });
  return { ok: false, reason: 'failed' };
}

/**
 * Request permission, obtain an FCM token, and persist it server-side
 * so a Cloud Function can later fan a push out to this device.
 *
 * Every failure comes back with a reason instead of a bare `null`. Until
 * 2026-09-26 all of them collapsed into the same "No se pudieron activar"
 * toast and a console.warn nobody sees in production — which is how a
 * backend that rejected 100% of tokens went unnoticed.
 */
export async function enablePush(): Promise<EnablePushResult> {
  if (!isPushSupported()) return { ok: false, reason: 'unsupported' };
  const messaging = await getClient();
  if (!messaging) return { ok: false, reason: 'unsupported' };

  const vapidKey = process.env['NEXT_PUBLIC_FIREBASE_VAPID_KEY'];
  if (!vapidKey) return failed('vapid-key-missing');

  // Nothing awaits the network before this line on purpose: Safari only
  // shows the permission dialog while the tap that triggered it is fresh.
  const permission = await Notification.requestPermission();
  if (permission === 'denied') return { ok: false, reason: 'denied' };
  if (permission !== 'granted') return { ok: false, reason: 'dismissed' };

  const sw = await registerSw();
  if (!sw) return failed('service-worker');

  let token: string;
  try {
    token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: sw });
  } catch (err) {
    return failed('get-token', err);
  }
  if (!token) return failed('get-token');

  // The callable reads the caller from the browser's Firebase session, which
  // can be missing while the server session is fine (home-screen web app on
  // iPhone). Restore it first — see lib/auth/client-token.ts.
  if (!(await ensureClientAuth())) return { ok: false, reason: 'session' };

  try {
    // The callable enforces auth + dedupes; we don't keep a local registry.
    await httpsCallable<{ token: string }, { ok: true }>(fb.functions, 'savePushToken')({ token });
  } catch (err) {
    return failed('save-token', err);
  }
  return { ok: true, token };
}

/**
 * Wire a foreground listener that surfaces FCM payloads while the tab
 * is focused. By default Firebase suppresses notifications when the
 * page is open, so we get the raw payload here and let the caller
 * decide how to display it (toast, badge bump, etc.).
 *
 * Stays synchronous for callers (React effects want an unsubscribe back
 * immediately) while the support probe resolves in the background. If the
 * caller tears down before the probe settles, we never attach at all.
 */
export function onForegroundPush(
  handler: (p: { title: string; body: string; url?: string }) => void,
): () => void {
  let unsub: (() => void) | null = null;
  let cancelled = false;

  void getClient().then((messaging) => {
    if (!messaging || cancelled) return;
    unsub = onMessage(messaging, (payload) => {
      const title = payload.notification?.title || payload.data?.['title'] || 'Renew Subastas';
      const body =
        payload.notification?.body || payload.data?.['body'] || 'Nueva actividad en tu cuenta.';
      const url = payload.fcmOptions?.link || payload.data?.['url'];
      handler({ title, body, ...(url ? { url } : {}) });
    });
  });

  return () => {
    cancelled = true;
    unsub?.();
    unsub = null;
  };
}
