/**
 * Long-running mirror process.
 *
 *   1. migrate Postgres schema (idempotent)
 *   2. full Firestore pass (so the copy is complete before anything else)
 *   3. start the live tail
 *   4. auth + storage pass now, then on their own intervals
 *   5. full reconciliation pass every N hours
 *   6. /healthz on MIRROR_HEALTH_PORT — 200 when the tail is attached and
 *      the last run of every kind finished OK, 503 otherwise, with a JSON
 *      body that says exactly what is wrong. Point Coolify's health check
 *      (or Beszel/Netdata) at it.
 *
 * Any of the periodic passes failing is logged and retried next interval;
 * only a failure to even start (bad config, unreachable Postgres, wrong
 * project key) exits the process, so the container restart policy kicks in.
 */
import http from 'node:http';
import { loadConfig } from './config.js';
import { initFirebase } from './firebase.js';
import { MirrorStore } from './store.js';
import { fullSync, startTail, type TailHandle } from './firestore-sync.js';
import { authSync } from './auth-sync.js';
import { storageSync } from './storage-sync.js';
import { log } from './log.js';

async function main() {
  const cfg = loadConfig();
  initFirebase(cfg.projectId, cfg.storageBucket);
  const store = new MirrorStore(cfg.databaseUrl);
  await store.migrate(cfg.rootCollections, cfg.subcollections);
  log.info(`mirror arrancando: proyecto=${cfg.projectId} bucket=${cfg.storageBucket}`);

  const r = await fullSync(store, cfg.rootCollections);
  log.info(`full inicial: ${r.seen} docs (${JSON.stringify(r.byRoot)})`);

  const tail: TailHandle = startTail(store, cfg.rootCollections, cfg.subcollections, cfg.noTail);

  const state = { lastError: null as string | null };
  const guarded = (name: string, fn: () => Promise<unknown>) => async () => {
    try {
      await fn();
      state.lastError = null;
    } catch (err) {
      state.lastError = `${name}: ${String(err)}`;
      log.error(`${name} falló; se reintenta en el próximo intervalo`, err);
    }
  };

  const runAuth = guarded('auth', () => authSync(store));
  const runStorage = guarded('storage', () =>
    storageSync(store, cfg.storageBucket, cfg.storageDir),
  );
  const runFull = guarded('full', () => fullSync(store, cfg.rootCollections));

  await runAuth();
  await runStorage();

  const timers = [
    setInterval(runAuth, cfg.authEveryMinutes * 60_000),
    setInterval(runStorage, cfg.storageEveryMinutes * 60_000),
    setInterval(runFull, cfg.reconcileEveryHours * 3600_000),
  ];

  let server: http.Server | undefined;
  if (cfg.healthPort > 0) {
    server = http.createServer(async (req, res) => {
      if (req.url !== '/healthz') {
        res.writeHead(404).end();
        return;
      }
      try {
        const s = await store.summary();
        const tailErrors = tail.errors();
        const badRuns = s.lastRuns.filter((x) => x.ok === false);
        const healthy = tail.active() > 0 && badRuns.length === 0 && !state.lastError;
        res.writeHead(healthy ? 200 : 503, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            healthy,
            tail: { listeners: tail.active(), applied: tail.applied(), errors: tailErrors },
            lastError: state.lastError,
            ...s,
          }),
        );
      } catch (err) {
        res.writeHead(503, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ healthy: false, error: String(err) }));
      }
    });
    server.listen(cfg.healthPort, () => log.info(`/healthz en :${cfg.healthPort}`));
  }

  const shutdown = async (sig: string) => {
    log.info(`${sig}: apagando`);
    for (const t of timers) clearInterval(t);
    tail.stop();
    server?.close();
    await store.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  log.error('mirror no pudo arrancar', err);
  process.exit(1);
});
