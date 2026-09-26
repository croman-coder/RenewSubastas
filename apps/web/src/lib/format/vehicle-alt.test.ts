import { describe, expect, it } from 'vitest';
import { vehicleAlt } from './vehicle-alt';

describe('vehicleAlt', () => {
  it('describes the photo with make, model and year', () => {
    expect(vehicleAlt('Toyota', 'Hilux', 2019)).toBe('Toyota Hilux 2019');
  });

  it('skips missing parts instead of printing blanks or a zero year', () => {
    expect(vehicleAlt('Renault', '', 0)).toBe('Renault');
    expect(vehicleAlt('', 'Duster', 2021)).toBe('Duster 2021');
  });

  it('falls back to a generic description when nothing is known', () => {
    expect(vehicleAlt('', '', 0)).toBe('Vehículo en subasta');
  });
});
