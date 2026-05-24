/* Firebase Cloud Messaging service worker for Renew Subastas.
 *
 * This file MUST live at the site root (`/firebase-messaging-sw.js`) for
 * Firebase to register it. Next.js serves anything in `public/` from the
 * root, so the path resolves correctly in both dev and prod.
 *
 * The Firebase SDK config is INJECTED at runtime via a query string —
 * `firebase-messaging-sw.js?apiKey=...&projectId=...&...` — because the
 * service-worker scope cannot read process.env / import.meta.env. The
 * client (lib/firebase/messaging.ts) builds the URL before registering.
 *
 * We pin SDK versions to a known-good compat build. Bumping requires
 * verifying that the `onBackgroundMessage` handler signature is stable.
 */

/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

const url = new URL(self.location.href);
const cfg = {
  apiKey: url.searchParams.get('apiKey'),
  authDomain: url.searchParams.get('authDomain'),
  projectId: url.searchParams.get('projectId'),
  storageBucket: url.searchParams.get('storageBucket'),
  messagingSenderId: url.searchParams.get('messagingSenderId'),
  appId: url.searchParams.get('appId'),
};

if (cfg.projectId && cfg.apiKey) {
  firebase.initializeApp(cfg);
  const messaging = firebase.messaging();

  // Background handler — fired only when the page is closed / not focused.
  // Foreground messages are handled directly by onMessage() in the client.
  messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || payload.data?.title || 'Renew Subastas';
    const body =
      payload.notification?.body || payload.data?.body || 'Nueva actividad en tu cuenta.';
    const url = payload.fcmOptions?.link || payload.data?.url || '/';
    self.registration.showNotification(title, {
      body,
      icon: '/icon.png',
      badge: '/icon.png',
      tag: payload.data?.tag || 'renew-notif',
      // Re-notify on the same tag so a second auction launching while
      // the buyer is offline still surfaces a fresh alert.
      renotify: true,
      data: { url },
    });
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/';
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Focus an existing tab if one already shows the same app origin —
      // otherwise open a fresh window. Keeps the back-stack clean.
      for (const c of clients) {
        if (c.url.includes(self.location.origin)) {
          c.focus();
          if ('navigate' in c) {
            try {
              await c.navigate(target);
            } catch {
              /* navigation cross-origin or blocked — ignore */
            }
          }
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
