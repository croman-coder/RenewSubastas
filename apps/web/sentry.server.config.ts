import * as Sentry from '@sentry/nextjs';
import { scrubEventUrls } from './src/lib/observability/sentry-scrub';

const dsn = process.env['SENTRY_DSN'] ?? process.env['NEXT_PUBLIC_SENTRY_DSN'];

// Redacts anything shaped like a credential from a captured stack frame's
// local variables. Belt-and-braces alongside includeLocalVariables: false
// below — if that ever gets flipped back on (or a future SDK version starts
// capturing locals by default), this still stops secrets from leaving.
const SECRET_KEY_RX =
  /private_key|service_account|client_email|idtoken|sessioncookie|__session|authorization|password/i;
function scrubVars(vars: Record<string, unknown> | undefined) {
  if (!vars) return;
  for (const key of Object.keys(vars)) {
    if (SECRET_KEY_RX.test(key)) vars[key] = '[Filtered]';
  }
}

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env['NEXT_PUBLIC_VERCEL_ENV'] ?? process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    // Was `true`: captures every local variable on every thrown exception,
    // including the full Firebase service-account JSON (private_key) that
    // lives in getAdminApp()'s locals whenever PEM parsing throws — a
    // failure mode the surrounding code comments say has happened in prod.
    // Never send that to a third party.
    includeLocalVariables: false,
    beforeSend(event) {
      for (const ex of event.exception?.values ?? []) {
        for (const frame of ex.stacktrace?.frames ?? []) {
          scrubVars(frame.vars as Record<string, unknown> | undefined);
        }
      }
      // The reset-password and email-action routes carry a redeemable secret
      // in their query string, and Sentry attaches the request URL to every
      // event. These pages render server-side too, so the leak isn't
      // client-only — see sentry-scrub.ts.
      return scrubEventUrls(event);
    },
  });
}
