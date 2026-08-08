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

  // Blocking 1 fix: buyNow.ts now rejects a stale confirm (staff edited
  // buyNowPrice between page load/dialog render and the click) with the same
  // failed-precondition code as "lost the race" above — this must land on
  // its own copy, not the generic "ya no disponible" one, or a buyer never
  // learns the price moved.
  it('maps a price-changed-underneath-you failed-precondition to its own message', () => {
    const result = classifyBuyNowError({
      code: 'functions/failed-precondition',
      message: 'El precio de Compra ya cambió respecto al que ves en pantalla.',
    });
    expect(result).toEqual({
      kind: 'message',
      text: 'El precio de Compra ya cambió. Revisá el precio actualizado antes de confirmar.',
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

  // Blocking 4: not-found must NOT assert the auction was deleted — it's
  // reachable both genuinely (a non-transactional deleteAuction racing a
  // live, zero-bid auction) and transiently (a concurrent buyNow's
  // transaction retry observing a false not-found under heavy contention,
  // even though the doc still exists — see the task-11 fix report). A
  // message claiming deletion would be wrong in the second case.
  it('maps not-found to a neutral retry message, never a deletion claim', () => {
    const result = classifyBuyNowError({
      code: 'functions/not-found',
      message: 'Auction not found',
    });
    expect(result.kind).toBe('message');
    expect((result as { text: string }).text).not.toMatch(/ya no existe|eliminad|borrad/i);
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
      {
        code: 'functions/failed-precondition',
        message: 'El precio de Compra ya cambió respecto al que ves en pantalla.',
      },
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
