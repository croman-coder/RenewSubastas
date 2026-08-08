import * as Sentry from '@sentry/nextjs';
import { scrubEventUrls } from './src/lib/observability/sentry-scrub';

const dsn = process.env['SENTRY_DSN'] ?? process.env['NEXT_PUBLIC_SENTRY_DSN'];

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env['NEXT_PUBLIC_VERCEL_ENV'] ?? process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    // Middleware runs on every request, including the reset-password and
    // email-action URLs whose query string holds a redeemable secret — see
    // sentry-scrub.ts.
    beforeSend: scrubEventUrls,
  });
}
