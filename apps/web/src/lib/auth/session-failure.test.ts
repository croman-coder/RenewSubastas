import { describe, it, expect } from 'vitest';
import { classifySessionFailure } from './session-failure';

const firebaseError = (code: string) => Object.assign(new Error(code), { code });

describe('classifySessionFailure', () => {
  it('marca como inválida la cookie que Firebase rechazó explícitamente', () => {
    for (const code of [
      'auth/session-cookie-expired',
      'auth/session-cookie-revoked',
      'auth/id-token-expired',
      'auth/id-token-revoked',
      'auth/user-disabled',
      'auth/user-not-found',
      'auth/argument-error',
    ]) {
      expect(classifySessionFailure(firebaseError(code))).toBe('invalid');
    }
  });

  it('no da por inválida una falla de infraestructura', () => {
    // El caso que provocaba los cierres de sesión al actualizar: la
    // verificación consulta a Google en cada render y a veces esa llamada no
    // llega. La cookie sigue siendo buena.
    for (const code of [
      'auth/internal-error',
      'auth/network-request-failed',
      'app/network-error',
      'unavailable',
      'deadline-exceeded',
    ]) {
      expect(classifySessionFailure(firebaseError(code))).toBe('temporary');
    }
  });

  it('ante un error sin código reconocible, no destruye la sesión', () => {
    // Por defecto se duda, no se borra: un código nuevo de una versión futura
    // del SDK no puede convertirse en un cierre de sesión masivo silencioso.
    expect(classifySessionFailure(new Error('boom'))).toBe('temporary');
    expect(classifySessionFailure(firebaseError('auth/algo-que-no-existe-aun'))).toBe('temporary');
    expect(classifySessionFailure({ code: 42 })).toBe('temporary');
    expect(classifySessionFailure(null)).toBe('temporary');
    expect(classifySessionFailure(undefined)).toBe('temporary');
  });
});
