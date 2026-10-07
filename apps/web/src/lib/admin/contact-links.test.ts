import { describe, it, expect } from 'vitest';
import {
  phoneDigits,
  whatsappUrl,
  telUrl,
  formatPhoneForReading,
  formatDocument,
  registrationLabel,
} from './contact-links';

describe('phoneDigits', () => {
  it('conserva el número internacional que ya viene con +595', () => {
    expect(phoneDigits('+595981123456')).toBe('595981123456');
  });

  it('convierte un celular local de Paraguay (0981...) a 595981...', () => {
    expect(phoneDigits('0981123456')).toBe('595981123456');
    expect(phoneDigits('0981 123 456')).toBe('595981123456');
  });

  it('respeta el prefijo de otro país', () => {
    expect(phoneDigits('+1 415 555 1234')).toBe('14155551234');
  });

  it('quita paréntesis y guiones de un fijo local con característica', () => {
    // (021) 123-456: 9 dígitos con el 0 inicial, fijo de Asunción.
    expect(phoneDigits('(021) 123-456')).toBe('59521123456');
  });

  it('acepta el 595 sin el signo +', () => {
    expect(phoneDigits('595981123456')).toBe('595981123456');
  });

  it('devuelve null si está vacío o es undefined', () => {
    expect(phoneDigits(undefined)).toBeNull();
    expect(phoneDigits('')).toBeNull();
    expect(phoneDigits('   ')).toBeNull();
  });

  it('devuelve null si tiene menos de 8 dígitos', () => {
    expect(phoneDigits('123456')).toBeNull();
    expect(phoneDigits('+595 12')).toBeNull();
  });
});

describe('whatsappUrl / telUrl', () => {
  it('arma el enlace de WhatsApp con solo dígitos', () => {
    expect(whatsappUrl('595981123456')).toBe('https://wa.me/595981123456');
  });

  it('arma el enlace tel: con el +', () => {
    expect(telUrl('595981123456')).toBe('tel:+595981123456');
  });
});

describe('formatPhoneForReading', () => {
  it('agrupa un número paraguayo para leerlo', () => {
    expect(formatPhoneForReading('+595981123456')).toBe('+595 981 123 456');
  });

  it('devuelve el texto guardado si no es un número paraguayo', () => {
    expect(formatPhoneForReading('+1 415 555 1234')).toBe('+1 415 555 1234');
  });

  it('devuelve null sin teléfono usable', () => {
    expect(formatPhoneForReading(undefined)).toBeNull();
  });
});

describe('formatDocument', () => {
  it('muestra tipo y número', () => {
    expect(formatDocument('CI', '1234567')).toBe('CI 1234567');
    expect(formatDocument('RUC', '80012345-6')).toBe('RUC 80012345-6');
    expect(formatDocument('PASSPORT', 'AB1234567')).toBe('Pasaporte AB1234567');
  });

  it('devuelve null si no hay número', () => {
    expect(formatDocument('CI', '')).toBeNull();
    expect(formatDocument(undefined, undefined)).toBeNull();
  });

  it('sin tipo conocido muestra solo el número', () => {
    expect(formatDocument(undefined, '1234567')).toBe('1234567');
  });
});

describe('registrationLabel', () => {
  it('nombra el método con el que se registró el comprador', () => {
    expect(registrationLabel('google')).toBe('Google');
    expect(registrationLabel('password')).toBe('Correo y contraseña');
  });

  it('sin provider (cuenta creada por el equipo) lo dice', () => {
    expect(registrationLabel(undefined)).toBe('Creado por el equipo');
    expect(registrationLabel('otro')).toBe('Creado por el equipo');
  });
});
