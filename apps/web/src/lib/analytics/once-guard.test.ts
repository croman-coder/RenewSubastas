import { describe, it, expect } from 'vitest';
import { createOnceGuard, type KeyValueStore } from './once-guard';

function fakeStore(
  initial: Record<string, string> = {},
): KeyValueStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  };
}

const throwingStore: KeyValueStore = {
  getItem() {
    throw new Error('SecurityError: storage is disabled');
  },
  setItem() {
    throw new Error('QuotaExceededError');
  },
};

describe('createOnceGuard', () => {
  it('claims a key the first time and refuses it afterwards', () => {
    const claim = createOnceGuard(fakeStore());
    expect(claim('purchase:a1')).toBe(true);
    expect(claim('purchase:a1')).toBe(false);
    expect(claim('purchase:a1')).toBe(false);
  });

  it('treats different keys independently', () => {
    const claim = createOnceGuard(fakeStore());
    expect(claim('purchase:a1')).toBe(true);
    expect(claim('purchase:a2')).toBe(true);
    expect(claim('purchase:a1')).toBe(false);
  });

  it('refuses a key a previous session already wrote', () => {
    // The whole point: a reload builds a brand-new guard, and the win banner
    // must not fire Purchase a second time.
    const claim = createOnceGuard(fakeStore({ 'purchase:a1': '1' }));
    expect(claim('purchase:a1')).toBe(false);
  });

  it('persists the claim so the next guard over the same store sees it', () => {
    const store = fakeStore();
    expect(createOnceGuard(store)('purchase:a1')).toBe(true);
    expect(createOnceGuard(store)('purchase:a1')).toBe(false);
  });

  it('still works once per instance with no store at all', () => {
    const claim = createOnceGuard(null);
    expect(claim('purchase:a1')).toBe(true);
    expect(claim('purchase:a1')).toBe(false);
  });

  it('never throws when the store does, and degrades to once per instance', () => {
    // Safari private browsing throws on setItem; some hardened profiles throw
    // on getItem. Either way the caller is inside a success path and must not
    // see an exception.
    const claim = createOnceGuard(throwingStore);
    expect(() => claim('purchase:a1')).not.toThrow();
    expect(claim('purchase:a2')).toBe(true);
    expect(claim('purchase:a2')).toBe(false);
  });

  it('does not consume the key when the store already refused it', () => {
    // A store that reports the key as present must win over the memory Set,
    // otherwise the first call after a reload would fire anyway.
    const claim = createOnceGuard(fakeStore({ 'signup:u1': '1' }));
    expect(claim('signup:u1')).toBe(false);
    expect(claim('signup:u1')).toBe(false);
  });
});
