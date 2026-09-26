import { describe, it, expect } from 'vitest';
import { auctionStatusVariant, vehicleStatusVariant } from './status-variant';

describe('status variants', () => {
  it('cada estado de subasta tiene un tono distinto', () => {
    const tones = ['live', 'scheduled', 'ended', 'cancelled'].map(auctionStatusVariant);
    expect(new Set(tones).size).toBe(4);
    expect(auctionStatusVariant('live')).toBe('success');
    expect(auctionStatusVariant('cancelled')).toBe('danger');
  });

  it('cada estado de vehículo tiene un tono distinto', () => {
    const tones = ['draft', 'ready', 'in_auction', 'sold', 'archived'].map(vehicleStatusVariant);
    expect(new Set(tones).size).toBe(5);
  });

  it('un estado desconocido cae en el gris neutro, no rompe', () => {
    expect(auctionStatusVariant('???')).toBe('secondary');
    expect(vehicleStatusVariant('???')).toBe('secondary');
  });
});
