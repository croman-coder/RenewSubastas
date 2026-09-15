/**
 * Firestore → Postgres: the full pass and the live tail.
 *
 * FULL PASS (`fullSync`): for each root collection, page through every
 * document and upsert it. For roots in `recurseRoots` (today: `auctions`),
 * also list each document's subcollections and copy them — one level deep,
 * which is as deep as this app's data goes. `listCollections()` is a
 * round-trip per document, so it is NOT done for flat roots: the first
 * production run asked it of every one of 7,000 rate-limit counters and took
 * twelve minutes; scoped to auctions it takes seconds. At the end, any path
 * the mirror had live under that root that was NOT seen this pass gets
 * soft-deleted. That is what makes the full pass a reconciliation
 * and not just a copy: it converges the mirror to Firestore even after the
 * tail missed events (restart, network blip, listener reset).
 *
 * TAIL (`startTail`): one onSnapshot per tailed root collection plus one
 * collectionGroup listener per known subcollection id. Each change is
 * applied as it arrives (added/modified → upsert, removed → soft delete).
 * The Admin SDK reconnects on its own; when a listener errors out for good,
 * the error handler restarts it after a backoff instead of leaving that
 * collection silently frozen.
 *
 * Reads are the only Firestore cost: the full pass is ~9k reads today (the
 * free tier is 50k/day), the tail is one read per changed document.
 */
import type { DocumentReference, DocumentSnapshot, Query } from 'firebase-admin/firestore';
import { db } from './firebase.js';
import { docToJson } from './convert.js';
import type { MirrorStore, DocRow } from './store.js';
import { log } from './log.js';

const PAGE = 500;
const BATCH = 200;

async function* pageCollection(q: Query): AsyncGenerator<DocumentSnapshot[]> {
  let last: DocumentSnapshot | undefined;
  for (;;) {
    let page = q.orderBy('__name__').limit(PAGE);
    if (last) page = page.startAfter(last);
    const snap = await page.get();
    if (snap.empty) return;
    yield snap.docs;
    if (snap.size < PAGE) return;
    last = snap.docs[snap.docs.length - 1];
  }
}

function toRow(d: DocumentSnapshot): DocRow {
  return { path: d.ref.path, data: docToJson(d.data() ?? {}) };
}

/** Copies the subcollections of one root document (one level deep). */
async function syncSubcollections(
  ref: DocumentReference,
  store: MirrorStore,
  seen: Set<string>,
  counters: { seen: number; upserted: number },
): Promise<void> {
  const subs = await ref.listCollections();
  for (const sub of subs) {
    let batch: DocRow[] = [];
    for await (const docs of pageCollection(sub)) {
      for (const d of docs) {
        seen.add(d.ref.path);
        counters.seen++;
        batch.push(toRow(d));
        if (batch.length >= BATCH) {
          counters.upserted += await store.upsertDocs(batch);
          batch = [];
        }
      }
    }
    if (batch.length) counters.upserted += await store.upsertDocs(batch);
  }
}

/** Runs `fn` over `items` with at most `limit` in flight. */
async function mapLimit<T>(items: readonly T[], limit: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++]!;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

export interface FullSyncResult {
  seen: number;
  upserted: number;
  deleted: number;
  byRoot: Record<string, number>;
}

export async function fullSync(
  store: MirrorStore,
  rootCollections: readonly string[],
  recurseRoots: readonly string[] = [],
  onProgress?: (root: string, seen: number) => void,
): Promise<FullSyncResult> {
  const runId = await store.startRun('full');
  const totals = { seen: 0, upserted: 0, deleted: 0 };
  const byRoot: Record<string, number> = {};
  try {
    for (const root of rootCollections) {
      const counters = { seen: 0, upserted: 0 };
      const seen = new Set<string>();
      const before = await store.livePathsUnderRoot(root);

      const recurse = recurseRoots.includes(root);
      let batch: DocRow[] = [];
      for await (const docs of pageCollection(db().collection(root))) {
        for (const d of docs) {
          seen.add(d.ref.path);
          counters.seen++;
          batch.push(toRow(d));
          if (batch.length >= BATCH) {
            counters.upserted += await store.upsertDocs(batch);
            batch = [];
          }
        }
        if (recurse) {
          // Subcollection discovery is a round-trip per document; a handful
          // in flight at once keeps a 100-auction pass at a few seconds.
          await mapLimit(docs, 8, (d) => syncSubcollections(d.ref, store, seen, counters));
        }
        onProgress?.(root, counters.seen);
      }
      if (batch.length) counters.upserted += await store.upsertDocs(batch);

      // Reconcile: anything live in the mirror under this root that Firestore
      // no longer has is gone. Soft-deleted, never dropped.
      const vanished = [...before].filter((p) => !seen.has(p));
      const deleted = await store.softDeleteDocs(vanished);

      byRoot[root] = counters.seen;
      totals.seen += counters.seen;
      totals.upserted += counters.upserted;
      totals.deleted += deleted;
      log.info(`full ${root}: ${counters.seen} docs, ${deleted} desaparecidos`);
    }
    await store.finishRun(runId, { ok: true, ...totals });
    return { ...totals, byRoot };
  } catch (err) {
    await store.finishRun(runId, { ok: false, ...totals, error: String(err) });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Tail
// ---------------------------------------------------------------------------

export interface TailHandle {
  stop(): void;
  /** Listeners currently attached (for /healthz). */
  active(): number;
  /** Changes applied since start (for /healthz). */
  applied(): number;
  /** Last error message per listener, if any. */
  errors(): Record<string, string>;
}

export function startTail(
  store: MirrorStore,
  rootCollections: readonly string[],
  subcollections: readonly string[],
  noTail: readonly string[],
): TailHandle {
  const unsubs = new Map<string, () => void>();
  const lastErr: Record<string, string> = {};
  let applied = 0;
  let stopped = false;

  const attach = (name: string, q: Query, backoffMs = 1000) => {
    if (stopped) return;
    let first = true;
    const unsub = q.onSnapshot(
      async (snap) => {
        // The first snapshot of a listener replays the whole collection.
        // That is redundant right after a full pass but harmless (idempotent
        // upserts) and exactly what we want after a reconnect.
        const changes = snap.docChanges();
        if (first) {
          first = false;
          log.info(`tail ${name}: escuchando (${snap.size} docs iniciales)`);
        }
        const ups: DocRow[] = [];
        const dels: string[] = [];
        for (const c of changes) {
          if (c.type === 'removed') dels.push(c.doc.ref.path);
          else ups.push(toRow(c.doc));
        }
        try {
          if (ups.length) await store.upsertDocs(ups);
          if (dels.length) await store.softDeleteDocs(dels);
          applied += changes.length;
          delete lastErr[name];
        } catch (err) {
          lastErr[name] = `pg: ${String(err)}`;
          log.error(`tail ${name}: fallo escribiendo en Postgres`, err);
        }
      },
      (err) => {
        // A terminal listener error. Detach, wait, re-attach with backoff —
        // capped at 5 minutes so a long outage doesn't turn into a
        // once-a-day retry.
        lastErr[name] = String(err);
        log.error(`tail ${name}: listener caído, reintento en ${backoffMs}ms`, err);
        unsubs.get(name)?.();
        unsubs.delete(name);
        setTimeout(() => attach(name, q, Math.min(backoffMs * 2, 300_000)), backoffMs);
      },
    );
    unsubs.set(name, unsub);
  };

  for (const root of rootCollections) {
    if (noTail.includes(root)) continue;
    attach(root, db().collection(root));
  }
  for (const sub of subcollections) {
    attach(`*/${sub}`, db().collectionGroup(sub));
  }

  return {
    stop() {
      stopped = true;
      for (const u of unsubs.values()) u();
      unsubs.clear();
    },
    active: () => unsubs.size,
    applied: () => applied,
    errors: () => ({ ...lastErr }),
  };
}
