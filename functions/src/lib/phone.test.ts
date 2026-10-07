import { describe, it, expect } from 'vitest';
import { hasUsablePhone } from './phone.js';

describe('hasUsablePhone', () => {
  it('acepta un celular en formato internacional', () => {
    expect(hasUsablePhone('+595981123456')).toBe(true);
  });

  it('acepta un número local con espacios, guiones y paréntesis', () => {
    expect(hasUsablePhone('0981 123 456')).toBe(true);
    expect(hasUsablePhone('(021) 123-456')).toBe(true);
  });

  it('acepta justo 8 dígitos', () => {
    expect(hasUsablePhone('12345678')).toBe(true);
  });

  it('rechaza menos de 8 dígitos', () => {
    expect(hasUsablePhone('1234567')).toBe(false);
    expect(hasUsablePhone('+595 12')).toBe(false);
  });

  it('rechaza vacío, solo espacios, undefined y valores que no son texto', () => {
    expect(hasUsablePhone('')).toBe(false);
    expect(hasUsablePhone('   ')).toBe(false);
    expect(hasUsablePhone(undefined)).toBe(false);
    expect(hasUsablePhone(null)).toBe(false);
    expect(hasUsablePhone(981123456)).toBe(false);
  });
});
