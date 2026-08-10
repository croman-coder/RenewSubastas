import { describe, it, expect, afterEach, vi } from 'vitest';
import { getSessionId } from './traffic-session';

/** Minimal Storage-shaped fake, backed by a Map instead of the real API. */
function fakeSessionStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

describe('getSessionId', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mints a new id and persists it when sessionStorage is empty', () => {
    const storage = fakeSessionStorage();
    vi.stubGlobal('window', { sessionStorage: storage });

    const id = getSessionId();

    expect(id).not.toBeNull();
    expect(storage.getItem('renew:traffic:sessionId')).toBe(id);
  });

  it('reuses an id already stored instead of minting a new one', () => {
    const storage = fakeSessionStorage({ 'renew:traffic:sessionId': 'existing-session-id' });
    vi.stubGlobal('window', { sessionStorage: storage });

    expect(getSessionId()).toBe('existing-session-id');
    expect(getSessionId()).toBe('existing-session-id');
  });

  it('returns the SAME id across repeated calls within the same tab', () => {
    const storage = fakeSessionStorage();
    vi.stubGlobal('window', { sessionStorage: storage });

    const first = getSessionId();
    const second = getSessionId();

    expect(second).toBe(first);
  });

  it('produces an id shaped exactly like DocId requires (crypto.randomUUID output)', () => {
    const storage = fakeSessionStorage();
    vi.stubGlobal('window', { sessionStorage: storage });

    const id = getSessionId();

    // functions/src/lib/ids.ts DocId: /^[A-Za-z0-9_-]{1,64}$/
    expect(id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  });

  it('returns null when window is unavailable (SSR)', () => {
    vi.stubGlobal('window', undefined);

    expect(getSessionId()).toBeNull();
  });

  it('returns null when accessing window.sessionStorage itself throws (Safari private mode)', () => {
    vi.stubGlobal('window', {
      get sessionStorage(): never {
        throw new DOMException('The operation is not allowed', 'SecurityError');
      },
    });

    expect(getSessionId()).toBeNull();
  });

  it('returns null when sessionStorage.getItem throws', () => {
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: () => {
          throw new Error('boom');
        },
        setItem: () => {},
      },
    });

    expect(getSessionId()).toBeNull();
  });

  it('returns null when sessionStorage.setItem throws (quota exceeded while minting)', () => {
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: () => null,
        setItem: () => {
          throw new Error('QuotaExceededError');
        },
      },
    });

    expect(getSessionId()).toBeNull();
  });
});
