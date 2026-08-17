import { describe, it, expect } from 'vitest';
import { resolveFinalPrice } from './final-price';

describe('resolveFinalPrice', () => {
  it('usa finalPrice cuando está', () => {
    expect(resolveFinalPrice({ finalPrice: 4000, currentBid: 4000 })).toBe(4000);
  });

  it('cae a currentBid en documentos anteriores al campo', () => {
    // `?? 0` mostraba USD 0 en la única pantalla donde se le pide plata a la
    // persona que ganó. currentBid es de donde finalPrice se copia al cerrar.
    expect(resolveFinalPrice({ currentBid: 12500 })).toBe(12500);
    expect(resolveFinalPrice({ finalPrice: 0, currentBid: 12500 })).toBe(12500);
  });

  it('devuelve 0 sólo cuando no hay ningún número plausible', () => {
    expect(resolveFinalPrice({})).toBe(0);
    expect(resolveFinalPrice({ finalPrice: null, currentBid: undefined })).toBe(0);
  });

  it('ignora valores que no son números usables', () => {
    expect(resolveFinalPrice({ finalPrice: '4000', currentBid: 3000 })).toBe(3000);
    expect(resolveFinalPrice({ finalPrice: Number.NaN, currentBid: 3000 })).toBe(3000);
    expect(resolveFinalPrice({ finalPrice: -5, currentBid: 3000 })).toBe(3000);
  });
});
