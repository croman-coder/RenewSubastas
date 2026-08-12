/**
 * A minimal `localStorage`-shaped store. Narrowed to the two methods this
 * file uses so a test can hand in a fake — and so nothing here can reach
 * for `clear()` or `length` on the real thing by accident.
 */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Builds a `claim(key)` that answers true exactly once per key.
 *
 * Exists for conversion events that describe a fact rather than an action.
 * "This buyer won auction X" stays true forever, so the component that
 * renders the win banner would fire Purchase again on every reload, every
 * tab, every time they come back to check the payment instructions. Meta
 * would count each one as another sale.
 *
 * Two layers, because neither alone is enough:
 *
 *   - The store (localStorage in the browser) survives reloads and new tabs,
 *     which is the case that actually happens.
 *   - The in-memory Set covers the store being absent or refusing to write —
 *     Safari private browsing throws on setItem, some privacy extensions make
 *     the whole object throw on access. There the guarantee degrades to
 *     once per page load, which is still far better than once per render.
 *
 * A throwing store must never break the caller: these guards sit inside
 * success paths (a bid landed, a purchase confirmed), and an exception there
 * would swallow the toast the buyer is waiting for.
 *
 * Only ever stores keys we mint ourselves — no personal data.
 */
export function createOnceGuard(store: KeyValueStore | null): (key: string) => boolean {
  const seen = new Set<string>();

  return function claim(key: string): boolean {
    if (seen.has(key)) return false;
    seen.add(key);

    if (!store) return true;

    try {
      if (store.getItem(key) !== null) return false;
      store.setItem(key, '1');
    } catch {
      // Storage unavailable or full. The memory Set above already recorded
      // the claim, so this page load stays correct; a reload may repeat it.
    }
    return true;
  };
}

/**
 * The browser's localStorage, or null when it can't be reached.
 *
 * Reading `window.localStorage` is itself throwable — a blocked third-party
 * context or a hardened browser profile raises on the property access, not
 * on the first method call — so the probe has to be inside the try.
 */
export function browserStore(): KeyValueStore | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
