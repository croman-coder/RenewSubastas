import 'server-only';
import { initializeApp, getApps, cert, applicationDefault, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { serverEnv } from '../env.server';

let app: App | null = null;

/**
 * Decodes the FIREBASE_SERVICE_ACCOUNT_KEY env var into a Firebase admin
 * credential object. Operators sometimes paste the raw JSON, sometimes
 * the base64-encoded JSON, and sometimes a JSON whose `private_key`
 * still has `\n` literals from the .env file. Handle all three so a
 * deploy doesn't break on the format of the secret.
 *
 * Throws a descriptive Error if the value can't be parsed — caller
 * surfaces it as a 500 with enough context for ops to fix the env var.
 */
function parseServiceAccount(raw: string): {
  project_id: string;
  client_email: string;
  private_key: string;
} {
  const trimmed = raw.trim();

  // Path A — already a JSON document. Cheaper than a failed base64
  // round-trip and covers the most common operator mistake (pasting
  // the downloaded JSON directly into Netlify).
  if (trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed) as {
      project_id?: string;
      client_email?: string;
      private_key?: string;
    };
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY JSON missing required fields');
    }
    return {
      project_id: parsed.project_id,
      client_email: parsed.client_email,
      // Some hosts collapse the PEM newlines into the literal `\n`. The
      // Firebase SDK requires real newlines, so normalise here.
      private_key: parsed.private_key.replace(/\\n/g, '\n'),
    };
  }

  // Path B — base64 of the JSON. Decode, then run the same shape guard.
  const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
  let parsed: { project_id?: string; client_email?: string; private_key?: string };
  try {
    parsed = JSON.parse(decoded);
  } catch {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_KEY is neither valid JSON nor valid base64-encoded JSON',
    );
  }
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY decoded JSON missing required fields');
  }
  return {
    project_id: parsed.project_id,
    client_email: parsed.client_email,
    private_key: parsed.private_key.replace(/\\n/g, '\n'),
  };
}

export function getAdminApp(): App {
  if (!app) {
    if (getApps().length) {
      app = getApps()[0]!;
    } else if (serverEnv.FIREBASE_AUTH_EMULATOR_HOST) {
      app = initializeApp({ projectId: serverEnv.FIREBASE_PROJECT_ID });
    } else if (serverEnv.FIREBASE_SERVICE_ACCOUNT_KEY) {
      const sa = parseServiceAccount(serverEnv.FIREBASE_SERVICE_ACCOUNT_KEY);
      app = initializeApp({
        credential: cert({
          projectId: sa.project_id,
          clientEmail: sa.client_email,
          privateKey: sa.private_key,
        }),
      });
    } else if (serverEnv.FIREBASE_CLIENT_EMAIL && serverEnv.FIREBASE_PRIVATE_KEY) {
      app = initializeApp({
        credential: cert({
          projectId: serverEnv.FIREBASE_PROJECT_ID,
          clientEmail: serverEnv.FIREBASE_CLIENT_EMAIL,
          // Same `\n` literal collapse on the split-vars path — Netlify
          // and Vercel both rewrite newlines on multi-line secrets.
          privateKey: serverEnv.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
    } else {
      app = initializeApp({ credential: applicationDefault() });
    }
  }
  return app;
}

export const adminAuth = (): Auth => getAuth(getAdminApp());
