import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const getMessagingMock = vi.fn(() => ({ __brand: 'messaging' }));
const onMessageMock = vi.fn(() => () => {});
const getTokenMock = vi.fn(async () => 'tok');
const isSupportedMock = vi.fn(async () => true);

vi.mock('firebase/messaging', () => ({
  getMessaging: getMessagingMock,
  getToken: getTokenMock,
  onMessage: onMessageMock,
  isSupported: isSupportedMock,
}));

const callableMock = vi.fn(async (_data: unknown) => ({ data: { ok: true } }));
vi.mock('firebase/functions', () => ({
  httpsCallable: () => callableMock,
}));

const ensureClientAuthMock = vi.fn(async () => true);
vi.mock('@/lib/auth/ensure-client-auth', () => ({ ensureClientAuth: ensureClientAuthMock }));

const captureExceptionMock = vi.fn();
vi.mock('@sentry/nextjs', () => ({ captureException: captureExceptionMock }));

vi.mock('./client', () => ({
  fb: { app: {}, functions: {} },
}));

async function loadModule() {
  vi.resetModules();
  return import('./messaging');
}

/** Flush the microtask queue so detached promise chains settle. */
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('messaging client gating', () => {
  beforeEach(() => {
    getMessagingMock.mockClear();
    onMessageMock.mockClear();
    isSupportedMock.mockClear();
    isSupportedMock.mockResolvedValue(true);
    vi.stubGlobal('window', {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('never calls getMessaging when the SDK reports the browser unsupported', async () => {
    // Regression: @firebase/messaging's getMessaging() kicks off its OWN
    // isWindowSupported() probe on a DETACHED promise and throws inside the
    // .then() when it fails. That rejection cannot be caught by any
    // try/catch around the call — it escapes as an unhandled rejection
    // ("messaging/unsupported-browser"). The only safe route is to await
    // isSupported() ourselves and never reach getMessaging() at all.
    isSupportedMock.mockResolvedValue(false);
    const mod = await loadModule();

    mod.onForegroundPush(() => {});
    await tick();

    expect(isSupportedMock).toHaveBeenCalled();
    expect(getMessagingMock).not.toHaveBeenCalled();
    expect(onMessageMock).not.toHaveBeenCalled();
  });

  it('calls getMessaging only after isSupported resolves true', async () => {
    const order: string[] = [];
    isSupportedMock.mockImplementation(async () => {
      order.push('isSupported');
      return true;
    });
    getMessagingMock.mockImplementation(() => {
      order.push('getMessaging');
      return { __brand: 'messaging' };
    });

    const mod = await loadModule();
    mod.onForegroundPush(() => {});
    await tick();

    expect(order).toEqual(['isSupported', 'getMessaging']);
    expect(onMessageMock).toHaveBeenCalledTimes(1);
  });

  it('probes support only once across repeated calls', async () => {
    const mod = await loadModule();
    mod.onForegroundPush(() => {});
    mod.onForegroundPush(() => {});
    await tick();

    expect(isSupportedMock).toHaveBeenCalledTimes(1);
    expect(getMessagingMock).toHaveBeenCalledTimes(1);
  });

  it('returns a usable unsubscribe even when support resolves late', async () => {
    const inner = vi.fn();
    onMessageMock.mockReturnValue(inner);
    const mod = await loadModule();

    const unsub = mod.onForegroundPush(() => {});
    // Unsubscribe BEFORE the async support probe settles.
    unsub();
    await tick();

    // Subscription was cancelled in flight: never attached, nothing leaked.
    expect(onMessageMock).not.toHaveBeenCalled();
  });

  it('unsubscribes the real listener when torn down after subscribing', async () => {
    const inner = vi.fn();
    onMessageMock.mockReturnValue(inner);
    const mod = await loadModule();

    const unsub = mod.onForegroundPush(() => {});
    await tick();
    expect(onMessageMock).toHaveBeenCalledTimes(1);

    unsub();
    expect(inner).toHaveBeenCalledTimes(1);
  });

  it('enablePush bails out without touching getMessaging on an unsupported browser', async () => {
    isSupportedMock.mockResolvedValue(false);
    vi.stubGlobal('window', { Notification: {}, PushManager: {} });
    vi.stubGlobal('navigator', { serviceWorker: {} });
    const mod = await loadModule();

    await expect(mod.enablePush()).resolves.toEqual({ ok: false, reason: 'unsupported' });
    expect(getMessagingMock).not.toHaveBeenCalled();
  });
});

describe('enablePush outcomes', () => {
  let permission: NotificationPermission;

  beforeEach(() => {
    permission = 'granted';
    isSupportedMock.mockResolvedValue(true);
    getTokenMock.mockReset();
    getTokenMock.mockResolvedValue('tok');
    callableMock.mockReset();
    callableMock.mockResolvedValue({ data: { ok: true } });
    ensureClientAuthMock.mockReset();
    ensureClientAuthMock.mockResolvedValue(true);
    captureExceptionMock.mockClear();
    const Notification = { requestPermission: async () => permission };
    vi.stubGlobal('window', { Notification, PushManager: {} });
    vi.stubGlobal('Notification', Notification);
    vi.stubGlobal('navigator', {
      serviceWorker: { register: async () => ({ active: {} }) },
    });
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_VAPID_KEY', 'test-vapid-key');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('saves the token and reports success', async () => {
    const mod = await loadModule();
    await expect(mod.enablePush()).resolves.toEqual({ ok: true, token: 'tok' });
    expect(callableMock).toHaveBeenCalledWith({ token: 'tok' });
  });

  it('tells a blocked site apart from a closed dialog', async () => {
    permission = 'denied';
    let mod = await loadModule();
    await expect(mod.enablePush()).resolves.toEqual({ ok: false, reason: 'denied' });
    permission = 'default';
    mod = await loadModule();
    await expect(mod.enablePush()).resolves.toEqual({ ok: false, reason: 'dismissed' });
    expect(getTokenMock).not.toHaveBeenCalled();
  });

  // iPhone 2026-09-25: the callable left without a Firebase user and came
  // back 401. Now the session is restored first, and if that is impossible
  // the buyer is told their session expired instead of a generic failure.
  it('restores the browser session before calling the backend', async () => {
    const mod = await loadModule();
    await mod.enablePush();
    expect(ensureClientAuthMock).toHaveBeenCalled();
    expect(ensureClientAuthMock.mock.invocationCallOrder[0]!).toBeLessThan(
      callableMock.mock.invocationCallOrder[0]!,
    );
  });

  it('reports an unrecoverable session without calling the backend', async () => {
    ensureClientAuthMock.mockResolvedValue(false);
    const mod = await loadModule();
    await expect(mod.enablePush()).resolves.toEqual({ ok: false, reason: 'session' });
    expect(callableMock).not.toHaveBeenCalled();
  });

  // Production 2026-09-25: savePushToken answered 500 for every buyer and the
  // only trace was a console.warn. A backend failure must reach Sentry.
  it('reports a backend failure to Sentry with the step that broke', async () => {
    callableMock.mockRejectedValue(new Error('internal'));
    const mod = await loadModule();
    await expect(mod.enablePush()).resolves.toEqual({ ok: false, reason: 'failed' });
    expect(captureExceptionMock).toHaveBeenCalledWith(expect.any(Error), {
      tags: { feature: 'push', step: 'save-token' },
    });
  });
});
