import { describe, it, expect } from 'vitest';
import { formatAmount, formatUsd, formatNumber } from './money';

describe('formatAmount', () => {
  // Intl en español no agrupa los números de cuatro cifras (regla de CLDR),
  // así que la misma pantalla mostraba "USD 9000" al lado de "USD 15.000".
  it('agrupa miles también en números de cuatro cifras', () => {
    expect(formatAmount(9000)).toBe('9.000');
    expect(formatAmount(1000)).toBe('1.000');
    expect(formatAmount(15000)).toBe('15.000');
    expect(formatAmount(1234567)).toBe('1.234.567');
  });

  it('muestra centavos solo cuando existen, con coma', () => {
    expect(formatAmount(29000)).toBe('29.000');
    expect(formatAmount(29000.5)).toBe('29.000,50');
    expect(formatAmount(29000.05)).toBe('29.000,05');
  });

  it('redondea a centavos (no deja pasar decimales sueltos)', () => {
    expect(formatAmount(16502.556)).toBe('16.502,56');
    expect(formatAmount(0.1 + 0.2)).toBe('0,30');
  });

  it('cero y negativos', () => {
    expect(formatAmount(0)).toBe('0');
    expect(formatAmount(-1500)).toBe('-1.500');
  });

  it('no inventa números con entradas inválidas', () => {
    expect(formatAmount(Number.NaN)).toBe('—');
    expect(formatAmount(Number.POSITIVE_INFINITY)).toBe('—');
  });

  // Mismo resultado en el servidor (Netlify, inglés, UTC) y en el navegador:
  // no depende de Intl ni del idioma del sistema.
  it('es idéntico sin importar el idioma del entorno', () => {
    const original = Intl.NumberFormat;
    try {
      // @ts-expect-error — simular un entorno sin Intl confiable
      Intl.NumberFormat = undefined;
      expect(formatAmount(29000.5)).toBe('29.000,50');
    } finally {
      Intl.NumberFormat = original;
    }
  });
});

describe('formatUsd', () => {
  it('antepone USD', () => {
    expect(formatUsd(9000)).toBe('USD 9.000');
    expect(formatUsd(29000.5)).toBe('USD 29.000,50');
  });
});

describe('formatNumber', () => {
  it('agrupa cantidades enteras', () => {
    expect(formatNumber(18000)).toBe('18.000');
    expect(formatNumber(1234)).toBe('1.234');
    expect(formatNumber(12)).toBe('12');
  });

  it('redondea a entero', () => {
    expect(formatNumber(1234.6)).toBe('1.235');
  });
});
