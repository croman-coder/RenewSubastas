import { describe, it, expect } from 'vitest';
import { DocId } from './ids.js';

describe('DocId', () => {
  it('accepts a normal Firestore auto-id', () => {
    expect(DocId.safeParse('aB3-xY_9').success).toBe(true);
  });
  it('rejects a path-injection attempt', () => {
    expect(DocId.safeParse('realId/bids/otherId').success).toBe(false);
  });
  it('rejects empty string', () => {
    expect(DocId.safeParse('').success).toBe(false);
  });
  it('rejects a value over 64 chars', () => {
    expect(DocId.safeParse('a'.repeat(65)).success).toBe(false);
  });
});
