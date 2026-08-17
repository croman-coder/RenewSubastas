import { describe, it, expect } from 'vitest';
import { describeProofUploadError } from './proof-upload-error';

const fbError = (code: string, message = '') => Object.assign(new Error(message), { code });

describe('describeProofUploadError', () => {
  it('ante un rechazo del bucket, manda a avisar en vez de a reintentar', () => {
    // Reintentar no arregla una regla que dijo que no. El texto crudo de
    // Firebase —"User does not have permission to access..."— era lo que veía
    // alguien pagando una seña desde el celular.
    const msg = describeProofUploadError(fbError('storage/unauthorized'));
    expect(msg).toContain('Escribinos');
    expect(msg).not.toMatch(/storage\/|Firebase|permission/i);
  });

  it('ante un corte de red, invita a reintentar', () => {
    for (const err of [
      fbError('storage/retry-limit-exceeded'),
      fbError('unavailable'),
      new TypeError('Load failed'),
    ]) {
      expect(describeProofUploadError(err)).toMatch(/de nuevo/i);
    }
  });

  it('ante una sesión vencida, dice que hay que volver a entrar', () => {
    expect(describeProofUploadError(fbError('unauthenticated'))).toMatch(/sesión/i);
  });

  it('nunca devuelve vacío ni filtra el error crudo', () => {
    for (const err of [null, undefined, {}, new Error('boom'), 'texto suelto']) {
      const msg = describeProofUploadError(err);
      expect(msg.length).toBeGreaterThan(0);
      expect(msg).not.toContain('boom');
    }
  });
});
