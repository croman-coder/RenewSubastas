/**
 * Runtime configuration, all from the environment. Nothing here has a
 * production default: a mirror that "just works" against the wrong project or
 * the wrong database is worse than one that refuses to start.
 */

export interface MirrorConfig {
  /** Postgres connection string, e.g. postgres://user:pass@127.0.0.1:5433/renewsubastas_mirror */
  databaseUrl: string;
  /** GCP project id. Doubles as a guard: the service account in
   *  GOOGLE_APPLICATION_CREDENTIALS must belong to this project. */
  projectId: string;
  /** Storage bucket to mirror (objects are downloaded under `storageDir`). */
  storageBucket: string;
  /** Local directory that receives Storage objects. */
  storageDir: string;
  /** Root collections to mirror. Subcollections are discovered per document
   *  during the full sync and tailed via collectionGroup listeners. */
  rootCollections: readonly string[];
  /** Known subcollection ids, for collectionGroup tail listeners. */
  subcollections: readonly string[];
  /** Root collections whose documents may HAVE subcollections. Only these get
   *  a `listCollections()` per document during the full pass. Today that is
   *  `auctions` alone (bids/viewers/priceChanges/private); every other root
   *  is flat, and asking Firestore "any subcollections?" for each of 7,000
   *  rate-limit counters is one round-trip each — the first production run
   *  spent twelve minutes doing exactly that. Add a root here the day it
   *  grows a subcollection, same as adding a new collection to the list
   *  above. */
  recurseRoots: readonly string[];
  /** Root collections that are transient counters — mirrored on the full
   *  sync (so the copy is complete) but NOT tailed in real time: they churn
   *  on every page view and carry nothing worth a listener. */
  noTail: readonly string[];
  /** Hours between full reconciliation passes while tailing. */
  reconcileEveryHours: number;
  /** Minutes between Auth user-list syncs. */
  authEveryMinutes: number;
  /** Minutes between Storage object syncs. */
  storageEveryMinutes: number;
  /** Port for the /healthz endpoint (0 disables it). */
  healthPort: number;
}

/** Every collection the app writes, per firestore.rules — the mirror follows
 *  the rules file, not a guess. Update both when a collection is added. */
export const DEFAULT_ROOT_COLLECTIONS = [
  'users',
  'vehicles',
  'auctions',
  'app_config',
  'audit_logs',
  'notifications',
  'password_reset_requests',
  'password_set_tokens',
  'rate_limits',
  'page_views',
  'insights_traffic_daily',
] as const;

export const DEFAULT_SUBCOLLECTIONS = ['bids', 'viewers', 'priceChanges', 'private'] as const;

export const DEFAULT_NO_TAIL = ['rate_limits', 'page_views'] as const;

export const DEFAULT_RECURSE_ROOTS = ['auctions'] as const;

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name}`);
  return v;
}

function numberOr(name: string, dflt: number): number {
  const v = process.env[name];
  if (v === undefined || v === '') return dflt;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} debe ser un número >= 0, no "${v}"`);
  return n;
}

function listOr(name: string, dflt: readonly string[]): readonly string[] {
  const v = process.env[name];
  if (!v) return dflt;
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): MirrorConfig {
  const prev = process.env;
  process.env = env;
  try {
    return {
      databaseUrl: required('MIRROR_DATABASE_URL'),
      projectId: required('MIRROR_PROJECT_ID'),
      storageBucket: required('MIRROR_STORAGE_BUCKET'),
      storageDir: process.env['MIRROR_STORAGE_DIR'] ?? '/data/storage',
      rootCollections: listOr('MIRROR_ROOT_COLLECTIONS', DEFAULT_ROOT_COLLECTIONS),
      subcollections: listOr('MIRROR_SUBCOLLECTIONS', DEFAULT_SUBCOLLECTIONS),
      noTail: listOr('MIRROR_NO_TAIL', DEFAULT_NO_TAIL),
      recurseRoots: listOr('MIRROR_RECURSE_ROOTS', DEFAULT_RECURSE_ROOTS),
      reconcileEveryHours: numberOr('MIRROR_RECONCILE_HOURS', 6),
      authEveryMinutes: numberOr('MIRROR_AUTH_MINUTES', 30),
      storageEveryMinutes: numberOr('MIRROR_STORAGE_MINUTES', 60),
      healthPort: numberOr('MIRROR_HEALTH_PORT', 8787),
    };
  } finally {
    process.env = prev;
  }
}
