import * as Sentry from '@sentry/nextjs';

const dsn = process.env['NEXT_PUBLIC_SENTRY_DSN'];

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env['NEXT_PUBLIC_VERCEL_ENV'] ?? process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    // Was 0.1 session / all-text-unmasked: recorded 10% of every visitor's
    // session with bank account numbers, CI/RUC, phone and address all
    // rendered in the clear (won/[auctionId], admin/users, staff/insights).
    // Error replays carry more diagnostic value than routine ones and are
    // enough to debug crashes; text/media stay masked either way.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0.1,
    integrations: [Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true })],
    // Third-party noise we can neither reproduce nor fix. Everything here is
    // injected into the page by someone else's runtime, not shipped by us —
    // verified with a repo-wide grep before adding. Keep this list narrow:
    // each entry needs a reason, or it becomes a place real bugs go to hide.
    ignoreErrors: [
      // Instagram's in-app browser injects a native bridge (sendDataToNative /
      // sendPageHideMessage) that dereferences window.webkit.messageHandlers.
      // On iOS it fires on pagehide and throws when the handler isn't mounted.
      // We have zero references to window.webkit anywhere in the codebase; the
      // reports are 100% from `browser = Instagram` sessions on ad-campaign
      // landings (/es/login?utm_source=ig).
      /window\.webkit\.messageHandlers/,
    ],
  });
}
