import { describe, it, expect, vi } from 'vitest';
import { mintClientToken } from './client-token';

function fakeAuth(verify: () => Promise<{ uid: string }>) {
  return {
    verifySessionCookie: vi.fn(verify),
    createCustomToken: vi.fn(async (uid: string) => `custom-for-${uid}`),
  };
}

describe('mintClientToken', () => {
  it('sin cookie no hay token', async () => {
    const auth = fakeAuth(async () => ({ uid: 'u1' }));
    await expect(mintClientToken(undefined, auth as never)).resolves.toEqual({
      status: 401,
      body: { error: 'no_session' },
    });
    expect(auth.createCustomToken).not.toHaveBeenCalled();
  });

  it('verifica la cookie contra revocación y cuenta deshabilitada', async () => {
    const auth = fakeAuth(async () => ({ uid: 'u1' }));
    await mintClientToken('cookie', auth as never);
    expect(auth.verifySessionCookie).toHaveBeenCalledWith('cookie', true);
  });

  it('una cookie inválida, revocada o de una cuenta deshabilitada no da token', async () => {
    const auth = fakeAuth(async () => {
      throw Object.assign(new Error('revoked'), { code: 'auth/session-cookie-revoked' });
    });
    await expect(mintClientToken('cookie', auth as never)).resolves.toEqual({
      status: 401,
      body: { error: 'invalid_session' },
    });
    expect(auth.createCustomToken).not.toHaveBeenCalled();
  });

  it('una cookie válida da un custom token del mismo usuario', async () => {
    const auth = fakeAuth(async () => ({ uid: 'u1' }));
    await expect(mintClientToken('cookie', auth as never)).resolves.toEqual({
      status: 200,
      body: { token: 'custom-for-u1', uid: 'u1' },
    });
  });
});
