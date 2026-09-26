import { describe, it, expect } from 'vitest';
import es from '../../../messages/es.json';
import en from '../../../messages/en.json';
import { vehicleEnumLabelKey, type VehicleEnumField } from './vehicle-labels';

const ENUMS: Record<VehicleEnumField, string[]> = {
  transmission: ['manual', 'automatic', 'cvt'],
  fuelType: ['gasoline', 'diesel', 'hybrid', 'electric'],
  condition: ['new', 'used', 'damaged'],
};

const label = (messages: typeof es | typeof en, key: string | null) =>
  key === null ? undefined : (messages.staff.vehicles.form as Record<string, unknown>)[key];

describe('vehicleEnumLabelKey', () => {
  it('traduce los valores que mostraba en inglés la ficha del comprador', () => {
    expect(label(es, vehicleEnumLabelKey('transmission', 'automatic'))).toBe('Automática');
    expect(label(es, vehicleEnumLabelKey('fuelType', 'electric'))).toBe('Eléctrico');
    expect(label(es, vehicleEnumLabelKey('condition', 'used'))).toBe('Usado');
  });

  // Si alguien agrega un valor al esquema sin su traducción, esto falla antes
  // de que el comprador vea la palabra en inglés.
  it('cada valor de cada enum tiene su texto en es y en en', () => {
    for (const [field, values] of Object.entries(ENUMS) as [VehicleEnumField, string[]][]) {
      for (const value of values) {
        const key = vehicleEnumLabelKey(field, value);
        expect(key, `${field}.${value}`).not.toBeNull();
        expect(typeof label(es, key), `es ${key}`).toBe('string');
        expect(typeof label(en, key), `en ${key}`).toBe('string');
      }
    }
  });

  it('devuelve null para un valor desconocido', () => {
    expect(vehicleEnumLabelKey('fuelType', 'nafta-vieja')).toBeNull();
  });
});
