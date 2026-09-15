import { describe, it, expect } from 'vitest';
import { Timestamp, GeoPoint } from 'firebase-admin/firestore';
import { docToJson, toJson } from './convert.js';

describe('toJson', () => {
  it('passes primitives, arrays and maps through', () => {
    expect(toJson('a')).toBe('a');
    expect(toJson(12.5)).toBe(12.5);
    expect(toJson(true)).toBe(true);
    expect(toJson(null)).toBeNull();
    expect(toJson(undefined)).toBeNull();
    expect(toJson([1, 'b', { c: [null] }])).toEqual([1, 'b', { c: [null] }]);
  });

  it('tags Firestore Timestamps as ISO strings', () => {
    const ts = Timestamp.fromMillis(Date.UTC(2026, 8, 15, 14, 0, 0));
    expect(toJson(ts)).toEqual({ $ts: '2026-09-15T14:00:00.000Z' });
  });

  it('keeps sub-millisecond nanos only when they exist', () => {
    const ts = new Timestamp(1_789_000_000, 123_456_789);
    const j = toJson(ts) as { $ts: string; $nanos?: number };
    expect(j.$ts).toBe(new Date(1_789_000_000_000 + 123).toISOString());
    expect(j.$nanos).toBe(123_456_789);
    const clean = toJson(new Timestamp(1_789_000_000, 5_000_000)) as Record<string, unknown>;
    expect(clean).not.toHaveProperty('$nanos');
  });

  it('tags plain Date the same way as Timestamp', () => {
    expect(toJson(new Date('2026-01-02T03:04:05.006Z'))).toEqual({
      $ts: '2026-01-02T03:04:05.006Z',
    });
  });

  it('tags GeoPoint', () => {
    expect(toJson(new GeoPoint(-25.3, -57.6))).toEqual({ $geo: { lat: -25.3, lng: -57.6 } });
  });

  it('reduces a DocumentReference to its path', () => {
    const fakeRef = { path: 'auctions/a1/bids/b1', id: 'b1', firestore: {} };
    expect(toJson(fakeRef)).toEqual({ $ref: 'auctions/a1/bids/b1' });
  });

  it('base64-encodes bytes', () => {
    expect(toJson(Buffer.from('hola'))).toEqual({ $bytes: 'aG9sYQ==' });
    expect(toJson(new Uint8Array([104, 105]))).toEqual({ $bytes: 'aGk=' });
  });

  it('carries non-finite numbers JSON cannot', () => {
    expect(toJson(NaN)).toEqual({ $num: 'NaN' });
    expect(toJson(Infinity)).toEqual({ $num: 'Infinity' });
    expect(toJson(-Infinity)).toEqual({ $num: '-Infinity' });
  });

  it('converts recursively inside arrays and maps', () => {
    const ts = Timestamp.fromMillis(0);
    expect(toJson({ a: [ts, { b: ts }] })).toEqual({
      a: [{ $ts: '1970-01-01T00:00:00.000Z' }, { b: { $ts: '1970-01-01T00:00:00.000Z' } }],
    });
  });

  it('never throws on an unknown class instance', () => {
    class Weird {
      toString() {
        return 'weird';
      }
    }
    expect(toJson(new Weird())).toEqual({ $unknown: 'weird' });
  });
});

describe('docToJson', () => {
  it('returns an object for document data', () => {
    expect(docToJson({ x: 1, when: Timestamp.fromMillis(0) })).toEqual({
      x: 1,
      when: { $ts: '1970-01-01T00:00:00.000Z' },
    });
  });

  it('survives JSON round-trip (what Postgres jsonb will do)', () => {
    const j = docToJson({
      a: Timestamp.fromMillis(1000),
      g: new GeoPoint(1, 2),
      n: [NaN, 1],
      b: Buffer.from([1]),
    });
    expect(JSON.parse(JSON.stringify(j))).toEqual(j);
  });
});
