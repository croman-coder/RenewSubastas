import { describe, it, expect } from 'vitest';
import { normalizeNationalPhone } from './phone-countries';

describe('normalizeNationalPhone', () => {
  it('en Paraguay quita el 0 inicial: 0981123456 queda 981123456', () => {
    expect(normalizeNationalPhone('595', '0981123456', 9)).toBe('981123456');
    expect(normalizeNationalPhone('595', '0981 123 456', 9)).toBe('981123456');
  });

  it('en Paraguay deja igual un número que ya viene sin 0', () => {
    expect(normalizeNationalPhone('595', '981123456', 9)).toBe('981123456');
  });

  it('en Paraguay aplica el límite de 9 dígitos después de quitar el 0', () => {
    expect(normalizeNationalPhone('595', '09811234567890', 9)).toBe('981123456');
  });

  it('en otros países no toca el 0 inicial', () => {
    expect(normalizeNationalPhone('54', '0111234567', 11)).toBe('0111234567');
  });

  it('quita todo lo que no sea dígito', () => {
    expect(normalizeNationalPhone('595', '(981) 123-456', 9)).toBe('981123456');
  });
});
