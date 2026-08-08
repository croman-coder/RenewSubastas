import { describe, it, expect } from 'vitest';
import { classifyBuyNowError } from './buy-now-error';

describe('classifyBuyNowError', () => {
  it('flags profile_incomplete by message regardless of code', () => {
    expect(
      classifyBuyNowError({ code: 'functions/failed-precondition', message: 'profile_incomplete' }),
    ).toEqual({ kind: 'profile_incomplete' });
  });

  // The race-condition scenario this task is built around: the loser's
  // bidCount check fails server-side, and that must never reach the screen
  // as the raw code.
  it('maps failed-precondition (lost the buy-now race, already ended, past endsAt) to a human message', () => {
    const result = classifyBuyNowError({
      code: 'functions/failed-precondition',
      message: 'Ya hay pujas en esta subasta: para participar tenés que pujar.',
    });
    expect(result).toEqual({
      kind: 'message',
      text: 'Esta unidad ya no está disponible para compra directa.',
    });
  });

  it('maps resource-exhausted (rate limited) to a human message', () => {
    const result = classifyBuyNowError({
      code: 'functions/resource-exhausted',
      message: 'Demasiados intentos. Probá de nuevo en un minuto.',
    });
    expect(result.kind).toBe('message');
    expect((result as { text: string }).text).not.toMatch(/resource-exhausted/);
  });

  it('maps permission-denied to a human message without leaking the code', () => {
    const result = classifyBuyNowError({
      code: 'functions/permission-denied',
      message: 'Esta unidad no pertenece a tu catálogo.',
    });
    expect(result.kind).toBe('message');
    expect((result as { text: string }).text).not.toMatch(/permission-denied/);
  });

  it('maps unauthenticated to a human message', () => {
    const result = classifyBuyNowError({
      code: 'functions/unauthenticated',
      message: 'Sign-in required',
    });
    expect(result).toEqual({
      kind: 'message',
      text: 'No tenés permiso para realizar esta compra.',
    });
  });

  it('maps not-found to a human message', () => {
    const result = classifyBuyNowError({
      code: 'functions/not-found',
      message: 'Auction not found',
    });
    expect(result).toEqual({ kind: 'message', text: 'Esta subasta ya no existe.' });
  });

  it('falls back to a generic human message for an unrecognized/missing code', () => {
    expect(classifyBuyNowError({})).toEqual({
      kind: 'message',
      text: 'No se pudo completar la compra.',
    });
  });

  it('never returns the raw error message verbatim for any mapped case', () => {
    const inputs: Array<{ code?: string; message?: string }> = [
      { code: 'functions/failed-precondition', message: 'Esta subasta no está activa.' },
      { code: 'functions/failed-precondition', message: 'Esta subasta ya cerró.' },
      { code: 'functions/failed-precondition', message: 'Esta subasta no admite compra directa.' },
      { code: 'functions/invalid-argument', message: 'Invalid input' },
    ];
    for (const input of inputs) {
      const result = classifyBuyNowError(input);
      if (result.kind === 'message') {
        expect(result.text).not.toBe(input.message);
      }
    }
  });
});
