/**
 * Long-running mirror process.
 *
 *   1. migrate Postgres schema (idempotent)
 *   2. start /healthz FIRST, reporting `phase: "initial-sync"` — a container
 *      doing its first import is alive and progressing, and Docker's
 *      health check (and a human) must be able to see that instead of an
 *      unexplained "unhealthy". The first production run took twelve
 *      minutes to import and looked dead the whole time.
 *   3. full Firestore pass (so the copy is complete before anything else)
 *   4. start the live tail
 *   5. auth + storage pass now, then on their own intervals
 *   6. full reconciliation pass every N hours
 *
 * /healthz is 200 while syncing or when the tail is attached and the last
 * run of every kind finished OK; 503 otherwise, with a JSON body that says
 * exactly what is wrong. Point Beszel/Netdata at it.
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

type Phase = 'starting' | 'initial-sync' | 'running';

async function main() {
  const cfg = loadConfig();
  initFirebase(cfg.projectId, cfg.storageBucket);
  const store = new MirrorStore(cfg.databaseUrl);
  await store.migrate(cfg.rootCollections, cfg.subcollections);
  log.info(`mirror arrancando: proyecto=${cfg.projectId} bucket=${cfg.storageBucket}`);

  const state = {
    phase: 'starting' as Phase,
    startedAt: new Date().toISOString(),
    progress: {} as Record<string, number>,
    lastError: null as string | null,
  };
  let tail: TailHandle | undefined;

  // ---- /healthz, before anything slow ------------------------------------
  let server: http.Server | undefined;
  if (cfg.healthPort > 0) {
    server = http.createServer(async (req, res) => {
      if (req.url !== '/healthz') {
        res.writeHead(404).end();
        return;
      }
      try {
        const s = await store.summary();
        const badRuns = s.lastRuns.filter((x) => x.ok === false);
        const tailOk = state.phase !== 'running' || (tail?.active() ?? 0) > 0;
        const healthy = tailOk && badRuns.length === 0 && !state.lastError;
        res.writeHead(healthy ? 200 : 503, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            healthy,
            phase: state.phase,
            startedAt: state.startedAt,
            progress: state.phase === 'initial-sync' ? state.progress : undefined,
            tail: tail
              ? { listeners: tail.active(), applied: tail.applied(), errors: tail.errors() }
              : null,
            lastError: state.lastError,
            ...s,
          }),
        );
      } catch (err) {
        res.writeHead(503, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ healthy: false, phase: state.phase, error: String(err) }));
      }
    });
    server.listen(cfg.healthPort, () => log.info(`/healthz en :${cfg.healthPort}`));
  }

  // ---- initial full pass --------------------------------------------------
  state.phase = 'initial-sync';
  const r = await fullSync(store, cfg.rootCollections, cfg.recurseRoots, (root, seen) => {
    state.progress[root] = seen;
  });
  log.info(`full inicial: ${r.seen} docs (${JSON.stringify(r.byRoot)})`);

  // ---- tail + periodic passes --------------------------------------------
  tail = startTail(store, cfg.rootCollections, cfg.subcollections, cfg.noTail);
  state.phase = 'running';

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
  const runFull = guarded('full', () => fullSync(store, cfg.rootCollections, cfg.recurseRoots));

  await runAuth();
  await runStorage();

  const timers = [
    setInterval(runAuth, cfg.authEveryMinutes * 60_000),
    setInterval(runStorage, cfg.storageEveryMinutes * 60_000),
    setInterval(runFull, cfg.reconcileEveryHours * 3600_000),
  ];

  const shutdown = async (sig: string) => {
    log.info(`${sig}: apagando`);
    for (const t of timers) clearInterval(t);
    tail?.stop();
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
