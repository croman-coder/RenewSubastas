import { describe, it, expect, vi } from 'vitest';
import { clearServerSession } from './clear-server-session';

const ok = (status = 200) => new Response(null, { status });

describe('clearServerSession', () => {
  it('pide el DELETE de la cookie', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok());
    await clearServerSession(fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledWith('/api/session', { method: 'DELETE' });
  });

  it('confirma sólo cuando el servidor respondió que sí', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok());
    await expect(clearServerSession(fetchImpl as unknown as typeof fetch)).resolves.toBe(true);
  });

  it('no confirma si el servidor respondió un error', async () => {
    // Un 500 deja la cookie viva igual que una caída de red. Mirar sólo si la
    // promesa resolvió —el bug original— daba por cerrada una sesión abierta.
    for (const status of [401, 500, 502]) {
      const fetchImpl = vi.fn().mockResolvedValue(ok(status));
      await expect(clearServerSession(fetchImpl as unknown as typeof fetch)).resolves.toBe(false);
    }
  });

  it('no confirma ni lanza cuando la red se cae', async () => {
    // `TypeError: Load failed` es lo que devuelve WebKit en iPhone cuando el
    // fetch no completa, y es el error que llegó a Sentry desde producción.
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Load failed'));
    await expect(clearServerSession(fetchImpl as unknown as typeof fetch)).resolves.toBe(false);
  });
});
