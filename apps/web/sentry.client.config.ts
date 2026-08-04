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
  });
}
