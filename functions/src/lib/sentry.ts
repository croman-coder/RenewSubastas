import * as Sentry from '@sentry/node';

let initialized = false;

export function initSentry(): void {
  if (initialized) return;
  const dsn = process.env['SENTRY_DSN'];
  if (!dsn) return;
  Sentry.init({ dsn, tracesSampleRate: 0.1 });
  initialized = true;
}

export { Sentry };
