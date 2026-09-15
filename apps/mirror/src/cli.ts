/**
 * One-shot commands, for operating the mirror by hand:
 *
 *   tsx src/cli.ts full      full Firestore pass + reconciliation, then exit
 *   tsx src/cli.ts auth      Auth pass, then exit
 *   tsx src/cli.ts storage   Storage pass, then exit
 *   tsx src/cli.ts verify    compare live Firestore counts against the mirror
 *
 * `verify` is the one to run after a deploy or when in doubt: it counts
 * documents per root collection on BOTH sides (count() aggregation on
 * Firestore — a handful of reads, not a scan) and prints the difference.
 * Zero difference everywhere = the mirror is current. A non-zero on a
 * tailed collection means the tail is behind or broken; on `rate_limits`/
 * `page_views` (not tailed) it just means the next full pass hasn't run.
 */
import { loadConfig } from './config.js';
import { db, initFirebase } from './firebase.js';
import { MirrorStore } from './store.js';
import { fullSync } from './firestore-sync.js';
import { authSync } from './auth-sync.js';
import { storageSync } from './storage-sync.js';
import { log } from './log.js';

const cmd = process.argv[2];
const cfg = loadConfig();
initFirebase(cfg.projectId, cfg.storageBucket);
const store = new MirrorStore(cfg.databaseUrl);
await store.migrate(cfg.rootCollections, cfg.subcollections);

let exitCode = 0;
try {
  switch (cmd) {
    case 'full': {
      const r = await fullSync(store, cfg.rootCollections);
      console.log(JSON.stringify(r, null, 2));
      break;
    }
    case 'auth': {
      console.log(JSON.stringify(await authSync(store), null, 2));
      break;
    }
    case 'storage': {
      console.log(
        JSON.stringify(await storageSync(store, cfg.storageBucket, cfg.storageDir), null, 2),
      );
      break;
    }
    case 'verify': {
      const s = await store.summary();
      console.log('\ncolección                 firestore   espejo   diff');
      let drift = 0;
      for (const root of cfg.rootCollections) {
        const live = (await db().collection(root).count().get()).data().count;
        // The mirror counts EVERY depth under the root; Firestore's count()
        // is the root collection only. Compare root-level rows only.
        const mirrored = await store.rootOnlyCount(root);
        const d = mirrored - live;
        if (d !== 0 && !cfg.noTail.includes(root)) drift++;
        console.log(
          `${root.padEnd(26)}${String(live).padStart(9)}${String(mirrored).padStart(9)}${String(d).padStart(7)}${cfg.noTail.includes(root) ? '   (sin tail)' : ''}`,
        );
      }
      for (const sub of cfg.subcollections) {
        const live = (await db().collectionGroup(sub).count().get()).data().count;
        const mirrored = await store.collectionCount(sub);
        const d = mirrored - live;
        if (d !== 0) drift++;
        console.log(
          `*/${sub.padEnd(24)}${String(live).padStart(9)}${String(mirrored).padStart(9)}${String(d).padStart(7)}`,
        );
      }
      console.log(`\nauth_users: ${s.authUsers}   storage_objects: ${s.storageObjects}`);
      console.log('últimas corridas:', JSON.stringify(s.lastRuns));
      console.log(drift === 0 ? '\nESPEJO AL DÍA' : `\nDESFASE en ${drift} colección(es) con tail`);
      exitCode = drift === 0 ? 0 : 1;
      break;
    }
    default:
      console.error('Uso: cli.ts full|auth|storage|verify');
      exitCode = 2;
  }
} catch (err) {
  log.error(`${cmd} falló`, err);
  exitCode = 1;
} finally {
  await store.close();
}
process.exit(exitCode);
