import { describe, it, expect, vi } from 'vitest';
import { bridgeClientAuth, type BridgeDeps } from './client-session-bridge';

function deps(currentUid: string | null, response?: Response | Error) {
  const fetchImpl = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response ?? new Response(null, { status: 500 });
  });
  const signIn = vi.fn(async () => undefined);
  const d: BridgeDeps = {
    auth: {
      authStateReady: async () => undefined,
      currentUser: currentUid ? { uid: currentUid } : null,
    },
    fetchImpl: fetchImpl as unknown as typeof fetch,
    signIn,
  };
  return { d, fetchImpl, signIn };
}

const tokenResponse = (uid: string) =>
  new Response(JSON.stringify({ token: 'custom-token', uid }), { status: 200 });

describe('bridgeClientAuth', () => {
  it('no toca la red cuando el navegador ya tiene al usuario correcto', async () => {
    const { d, fetchImpl, signIn } = deps('u1');
    await expect(bridgeClientAuth('u1', d)).resolves.toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(signIn).not.toHaveBeenCalled();
  });

  // El caso de producción (iPhone, 2026-09-25): página protegida cargada con
  // la cookie del servidor y el SDK del navegador sin usuario.
  it('recompone la sesión del cliente desde la cookie cuando falta', async () => {
    const { d, fetchImpl, signIn } = deps(null, tokenResponse('u1'));
    await expect(bridgeClientAuth('u1', d)).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith('/api/session/client-token', { method: 'POST' });
    expect(signIn).toHaveBeenCalledWith('custom-token');
  });

  it('reemplaza a un usuario distinto del de la cookie', async () => {
    const { d, signIn } = deps('otro', tokenResponse('u1'));
    await expect(bridgeClientAuth('u1', d)).resolves.toBe(true);
    expect(signIn).toHaveBeenCalledWith('custom-token');
  });

  it('no entra si el token que vuelve es de otra persona', async () => {
    const { d, signIn } = deps(null, tokenResponse('otro'));
    await expect(bridgeClientAuth('u1', d)).resolves.toBe(false);
    expect(signIn).not.toHaveBeenCalled();
  });

  it('devuelve false —sin lanzar— si la cookie ya no vale', async () => {
    const { d, signIn } = deps(null, new Response('{"error":"invalid_session"}', { status: 401 }));
    await expect(bridgeClientAuth('u1', d)).resolves.toBe(false);
    expect(signIn).not.toHaveBeenCalled();
  });

  it('devuelve false —sin lanzar— si la red se cae', async () => {
    const { d } = deps(null, new TypeError('Load failed'));
    await expect(bridgeClientAuth('u1', d)).resolves.toBe(false);
  });

  it('devuelve false si el SDK rechaza el token', async () => {
    const { d, signIn } = deps(null, tokenResponse('u1'));
    signIn.mockRejectedValueOnce(new Error('auth/invalid-custom-token'));
    await expect(bridgeClientAuth('u1', d)).resolves.toBe(false);
  });
});
