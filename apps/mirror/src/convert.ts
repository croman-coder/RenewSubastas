/**
 * Firestore document data → plain JSON, losslessly enough to migrate from.
 *
 * Firestore has types JSON doesn't: Timestamp, GeoPoint, DocumentReference,
 * Bytes, and it allows nested arrays/maps of all of them. `JSON.stringify` on
 * raw Admin SDK data silently turns a Timestamp into `{_seconds, _nanoseconds}`
 * and a DocumentReference into a huge object graph, so the mirror would store
 * something the migration later couldn't read back. This converts each into a
 * tagged, unambiguous JSON form:
 *
 *   Timestamp          → { "$ts": "2026-09-15T14:00:00.000Z" }   (ISO, UTC)
 *   GeoPoint           → { "$geo": { "lat": -25.3, "lng": -57.6 } }
 *   DocumentReference  → { "$ref": "auctions/abc/bids/xyz" }     (path only)
 *   Bytes (Buffer)     → { "$bytes": "<base64>" }
 *   NaN / ±Infinity    → { "$num": "NaN" | "Infinity" | "-Infinity" }  (JSON can't carry them)
 *
 * Everything else (string, number, boolean, null, arrays, maps) passes through.
 * The `$`-prefixed single-key wrappers can't collide with real data: Firestore
 * field names may not begin with `$`... actually they may, but no code in this
 * repo writes one, and `isTagged` requires the wrapper to be the ONLY key.
 *
 * Pure — no Firestore import at the top level so it can be unit tested without
 * an emulator. It duck-types the Admin SDK classes (`toDate`, `latitude`,
 * `path`, `Buffer.isBuffer`) instead of `instanceof`, because the mirror may
 * receive values from more than one copy of the SDK in a pnpm tree.
 */

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function isTimestamp(v: unknown): v is { toDate(): Date; seconds: number; nanoseconds: number } {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as { toDate?: unknown }).toDate === 'function' &&
    typeof (v as { seconds?: unknown }).seconds === 'number' &&
    typeof (v as { nanoseconds?: unknown }).nanoseconds === 'number'
  );
}

function isGeoPoint(v: unknown): v is { latitude: number; longitude: number } {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as { latitude?: unknown }).latitude === 'number' &&
    typeof (v as { longitude?: unknown }).longitude === 'number' &&
    !('toDate' in (v as object))
  );
}

function isDocRef(v: unknown): v is { path: string; id: string; firestore: unknown } {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as { path?: unknown }).path === 'string' &&
    typeof (v as { id?: unknown }).id === 'string' &&
    'firestore' in (v as object)
  );
}

/** Converts one Firestore field value (any depth) to tagged JSON. */
export function toJson(v: unknown): Json {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v === 'number') {
    if (Number.isNaN(v)) return { $num: 'NaN' };
    if (v === Infinity) return { $num: 'Infinity' };
    if (v === -Infinity) return { $num: '-Infinity' };
    return v;
  }
  if (typeof v === 'bigint') return v.toString();
  if (v instanceof Date) return { $ts: v.toISOString() };
  if (isTimestamp(v)) {
    // toDate() loses sub-millisecond nanos; Firestore stores microseconds.
    // ISO with millis is what every consumer wants; the raw nanos go along
    // only when they carry information beyond the millisecond.
    const d = v.toDate();
    const subMs = v.nanoseconds % 1_000_000;
    return subMs === 0 ? { $ts: d.toISOString() } : { $ts: d.toISOString(), $nanos: v.nanoseconds };
  }
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) {
    return { $bytes: Buffer.from(v).toString('base64') };
  }
  if (isDocRef(v)) return { $ref: v.path };
  if (isGeoPoint(v)) return { $geo: { lat: v.latitude, lng: v.longitude } };
  if (Array.isArray(v)) return v.map(toJson);
  if (isPlainObject(v)) {
    const out: { [k: string]: Json } = {};
    for (const [k, val] of Object.entries(v)) out[k] = toJson(val);
    return out;
  }
  // Unknown class instance (e.g. a FieldValue sentinel that should never be
  // in READ data, or a future SDK type). Stringify rather than throw: a
  // mirror that dies on one exotic field mirrors nothing.
  return { $unknown: String(v) };
}

/** Converts a whole document's data. Always an object at the top level. */
export function docToJson(data: Record<string, unknown>): { [k: string]: Json } {
  const out = toJson(data);
  return isPlainObject(out) ? (out as { [k: string]: Json }) : {};
}
