/**
 * The Postgres side of the mirror.
 *
 * Layout — deliberately dumb, so the mirror never has to know the app's
 * schema and never breaks when a field is added:
 *
 *   fs_documents   one row per Firestore document, any depth.
 *     path         'auctions/abc/bids/xyz'     (primary key)
 *     collection   'bids'                      (last collection id, for querying)
 *     root         'auctions'                  (first segment)
 *     parent_path  'auctions/abc' or NULL
 *     doc_id       'xyz'
 *     data         jsonb  — see convert.ts for the tagged form
 *     first_seen / last_seen / deleted_at   timestamptz
 *
 *   auth_users     one row per Firebase Auth account (no password hashes —
 *                  those come out of `firebase auth:export` only when the
 *                  migration actually happens; see the feasibility doc).
 *
 *   storage_objects  one row per bucket object + where it landed on disk.
 *
 *   mirror_runs    a log line per full/auth/storage pass — what ran, when,
 *                  how many rows, and whether it finished. This is how you
 *                  tell "quiet because nothing changed" from "quiet because
 *                  it died".
 *
 * Soft deletes: a document that disappears from Firestore gets `deleted_at`
 * set, never a DELETE. The migration wants to know what existed and when it
 * went away; and a bug in the mirror can be undone by clearing the column.
 *
 * Per-collection VIEWS (`v_auctions`, `v_users`, …) are created on top so
 * `select data->>'status' from v_auctions` reads naturally. They filter out
 * soft-deleted rows.
 */
import pg from 'pg';
import type { Json } from './convert.js';

const { Pool } = pg;

export interface DocRow {
  path: string;
  data: { [k: string]: Json };
}

export interface AuthUserRow {
  uid: string;
  email: string | null;
  email_verified: boolean;
  phone: string | null;
  display_name: string | null;
  photo_url: string | null;
  disabled: boolean;
  providers: string[];
  custom_claims: Json;
  created_at: string | null;
  last_sign_in_at: string | null;
  last_refresh_at: string | null;
  tokens_valid_after: string | null;
}

export interface StorageObjectRow {
  name: string;
  bucket: string;
  size: number;
  content_type: string | null;
  md5: string | null;
  generation: string | null;
  updated_at: string | null;
  local_path: string | null;
}

export type RunKind = 'full' | 'auth' | 'storage' | 'tail';

export class MirrorStore {
  private readonly pool: pg.Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl, max: 5 });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  /** Idempotent DDL. Safe to run on every start. */
  async migrate(rootCollections: readonly string[], subcollections: readonly string[]) {
    await this.pool.query(`
      create table if not exists fs_documents (
        path         text primary key,
        collection   text not null,
        root         text not null,
        parent_path  text,
        doc_id       text not null,
        data         jsonb not null,
        first_seen   timestamptz not null default now(),
        last_seen    timestamptz not null default now(),
        deleted_at   timestamptz
      );
      create index if not exists fs_documents_collection_idx on fs_documents (collection) where deleted_at is null;
      create index if not exists fs_documents_root_idx on fs_documents (root);
      create index if not exists fs_documents_parent_idx on fs_documents (parent_path);
      create index if not exists fs_documents_data_gin on fs_documents using gin (data jsonb_path_ops);

      create table if not exists auth_users (
        uid                text primary key,
        email              text,
        email_verified     boolean not null default false,
        phone              text,
        display_name       text,
        photo_url          text,
        disabled           boolean not null default false,
        providers          text[] not null default '{}',
        custom_claims      jsonb not null default '{}'::jsonb,
        created_at         timestamptz,
        last_sign_in_at    timestamptz,
        last_refresh_at    timestamptz,
        tokens_valid_after timestamptz,
        first_seen         timestamptz not null default now(),
        last_seen          timestamptz not null default now(),
        deleted_at         timestamptz
      );

      create table if not exists storage_objects (
        name          text primary key,
        bucket        text not null,
        size          bigint not null,
        content_type  text,
        md5           text,
        generation    text,
        updated_at    timestamptz,
        local_path    text,
        first_seen    timestamptz not null default now(),
        last_seen     timestamptz not null default now(),
        deleted_at    timestamptz
      );

      create table if not exists mirror_runs (
        id          bigserial primary key,
        kind        text not null,
        started_at  timestamptz not null default now(),
        finished_at timestamptz,
        ok          boolean,
        rows_seen   integer,
        rows_upserted integer,
        rows_deleted  integer,
        error       text
      );
      create index if not exists mirror_runs_kind_idx on mirror_runs (kind, started_at desc);
    `);

    // One view per known collection. `create or replace` keeps them current
    // if the column list ever changes.
    for (const c of [...new Set([...rootCollections, ...subcollections])]) {
      const view = `v_${c.replace(/[^a-zA-Z0-9_]/g, '_')}`;
      await this.pool.query(`
        create or replace view ${view} as
          select path, parent_path, doc_id, data, first_seen, last_seen
          from fs_documents
          where collection = $$${c}$$ and deleted_at is null
      `);
    }
  }

  /** Upserts a batch of documents. Re-seeing a document clears any soft delete. */
  async upsertDocs(rows: readonly DocRow[]): Promise<number> {
    if (rows.length === 0) return 0;
    const values: unknown[] = [];
    const tuples: string[] = [];
    rows.forEach((r, i) => {
      const segs = r.path.split('/');
      const docId = segs[segs.length - 1]!;
      const collection = segs[segs.length - 2]!;
      const root = segs[0]!;
      const parentPath = segs.length > 2 ? segs.slice(0, -2).join('/') : null;
      const base = i * 6;
      tuples.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}::jsonb)`,
      );
      values.push(r.path, collection, root, parentPath, docId, JSON.stringify(r.data));
    });
    const res = await this.pool.query(
      `insert into fs_documents (path, collection, root, parent_path, doc_id, data)
       values ${tuples.join(',')}
       on conflict (path) do update set
         data = excluded.data,
         last_seen = now(),
         deleted_at = null`,
      values,
    );
    return res.rowCount ?? 0;
  }

  async softDeleteDocs(paths: readonly string[]): Promise<number> {
    if (paths.length === 0) return 0;
    const res = await this.pool.query(
      `update fs_documents set deleted_at = now() where path = any($1) and deleted_at is null`,
      [paths],
    );
    return res.rowCount ?? 0;
  }

  /** Paths currently live in the mirror for a root collection (any depth). */
  async livePathsUnderRoot(root: string): Promise<Set<string>> {
    const res = await this.pool.query<{ path: string }>(
      `select path from fs_documents where root = $1 and deleted_at is null`,
      [root],
    );
    return new Set(res.rows.map((r) => r.path));
  }

  async upsertAuthUsers(rows: readonly AuthUserRow[]): Promise<number> {
    let n = 0;
    for (const u of rows) {
      const res = await this.pool.query(
        `insert into auth_users (uid, email, email_verified, phone, display_name, photo_url, disabled,
            providers, custom_claims, created_at, last_sign_in_at, last_refresh_at, tokens_valid_after)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13)
         on conflict (uid) do update set
           email = excluded.email, email_verified = excluded.email_verified, phone = excluded.phone,
           display_name = excluded.display_name, photo_url = excluded.photo_url, disabled = excluded.disabled,
           providers = excluded.providers, custom_claims = excluded.custom_claims,
           created_at = excluded.created_at, last_sign_in_at = excluded.last_sign_in_at,
           last_refresh_at = excluded.last_refresh_at, tokens_valid_after = excluded.tokens_valid_after,
           last_seen = now(), deleted_at = null`,
        [
          u.uid,
          u.email,
          u.email_verified,
          u.phone,
          u.display_name,
          u.photo_url,
          u.disabled,
          u.providers,
          JSON.stringify(u.custom_claims),
          u.created_at,
          u.last_sign_in_at,
          u.last_refresh_at,
          u.tokens_valid_after,
        ],
      );
      n += res.rowCount ?? 0;
    }
    return n;
  }

  async softDeleteAuthUsersNotIn(uids: readonly string[]): Promise<number> {
    const res = await this.pool.query(
      `update auth_users set deleted_at = now() where deleted_at is null and not (uid = any($1))`,
      [uids],
    );
    return res.rowCount ?? 0;
  }

  async getStorageIndex(): Promise<Map<string, { md5: string | null; generation: string | null }>> {
    const res = await this.pool.query<{
      name: string;
      md5: string | null;
      generation: string | null;
    }>(`select name, md5, generation from storage_objects where deleted_at is null`);
    return new Map(res.rows.map((r) => [r.name, { md5: r.md5, generation: r.generation }]));
  }

  async upsertStorageObject(o: StorageObjectRow): Promise<void> {
    await this.pool.query(
      `insert into storage_objects (name, bucket, size, content_type, md5, generation, updated_at, local_path)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (name) do update set
         bucket = excluded.bucket, size = excluded.size, content_type = excluded.content_type,
         md5 = excluded.md5, generation = excluded.generation, updated_at = excluded.updated_at,
         local_path = excluded.local_path, last_seen = now(), deleted_at = null`,
      [o.name, o.bucket, o.size, o.content_type, o.md5, o.generation, o.updated_at, o.local_path],
    );
  }

  async softDeleteStorageNotIn(names: readonly string[]): Promise<number> {
    const res = await this.pool.query(
      `update storage_objects set deleted_at = now() where deleted_at is null and not (name = any($1))`,
      [names],
    );
    return res.rowCount ?? 0;
  }

  async startRun(kind: RunKind): Promise<number> {
    const res = await this.pool.query<{ id: number }>(
      `insert into mirror_runs (kind) values ($1) returning id`,
      [kind],
    );
    return res.rows[0]!.id;
  }

  async finishRun(
    id: number,
    r: { ok: boolean; seen?: number; upserted?: number; deleted?: number; error?: string },
  ): Promise<void> {
    await this.pool.query(
      `update mirror_runs set finished_at = now(), ok = $2, rows_seen = $3, rows_upserted = $4,
         rows_deleted = $5, error = $6 where id = $1`,
      [id, r.ok, r.seen ?? null, r.upserted ?? null, r.deleted ?? null, r.error ?? null],
    );
  }

  /** Live root-level documents of one root collection (no subcollection rows). */
  async rootOnlyCount(root: string): Promise<number> {
    const r = await this.pool.query<{ n: string }>(
      `select count(*)::text as n from fs_documents
       where root = $1 and parent_path is null and deleted_at is null`,
      [root],
    );
    return Number(r.rows[0]?.n ?? 0);
  }

  /** Live documents whose immediate collection id is `collection`, any depth. */
  async collectionCount(collection: string): Promise<number> {
    const r = await this.pool.query<{ n: string }>(
      `select count(*)::text as n from fs_documents where collection = $1 and deleted_at is null`,
      [collection],
    );
    return Number(r.rows[0]?.n ?? 0);
  }

  /** Counts for the verify command and the health endpoint. */
  async summary(): Promise<{
    docs: number;
    docsByRoot: Record<string, number>;
    authUsers: number;
    storageObjects: number;
    lastRuns: Array<{
      kind: string;
      started_at: string;
      finished_at: string | null;
      ok: boolean | null;
    }>;
  }> {
    const docs = await this.pool.query<{ root: string; n: string }>(
      `select root, count(*)::text as n from fs_documents where deleted_at is null group by root order by root`,
    );
    const au = await this.pool.query<{ n: string }>(
      `select count(*)::text as n from auth_users where deleted_at is null`,
    );
    const so = await this.pool.query<{ n: string }>(
      `select count(*)::text as n from storage_objects where deleted_at is null`,
    );
    const runs = await this.pool.query<{
      kind: string;
      started_at: string;
      finished_at: string | null;
      ok: boolean | null;
    }>(
      `select distinct on (kind) kind, started_at::text, finished_at::text, ok
       from mirror_runs order by kind, started_at desc`,
    );
    const docsByRoot: Record<string, number> = {};
    let total = 0;
    for (const r of docs.rows) {
      docsByRoot[r.root] = Number(r.n);
      total += Number(r.n);
    }
    return {
      docs: total,
      docsByRoot,
      authUsers: Number(au.rows[0]?.n ?? 0),
      storageObjects: Number(so.rows[0]?.n ?? 0),
      lastRuns: runs.rows,
    };
  }
}
