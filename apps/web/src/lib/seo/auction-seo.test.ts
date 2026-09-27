import { describe, expect, it } from 'vitest';
import { auctionDescription, auctionMetadata, auctionTitle, vehicleJsonLd } from './auction-seo';
import type { PublicAuctionDetail } from '@/lib/buyer/public-auction';

const d: PublicAuctionDetail = {
  id: 'auc-1',
  vehicleId: 'veh-1',
  make: 'Toyota',
  model: 'Hilux',
  year: 2019,
  mileage: 85000,
  transmission: 'automatic',
  fuelType: 'diesel',
  color: 'Blanco',
  condition: 'used',
  descriptionEs: 'Única dueña.',
  descriptionEn: null,
  images: [{ url: 'https://img.test/a.jpg', thumbnailUrl: 'https://img.test/a.webp' }],
  startingPrice: 10000,
  currentBid: 18500,
  bidCount: 4,
  bidIncrement: 500,
  buyNowPrice: null,
  status: 'live',
  outcome: null,
  startsAtMs: Date.parse('2026-10-01T12:00:00Z'),
  // 18:00 en Asunción (UTC-3).
  endsAtMs: Date.parse('2026-10-03T21:00:00Z'),
};
const labels = { fuel: 'Diésel', transmission: 'Automática' };
const live = { kind: 'live', indexable: true } as const;

describe('auctionTitle', () => {
  it('names the car and the auction', () => {
    expect(auctionTitle(d)).toBe('Toyota Hilux 2019 en subasta · Renew Subastas');
  });
});

describe('auctionDescription', () => {
  it('summarises km, fuel, transmission, current bid and closing time', () => {
    expect(auctionDescription(d, labels, live)).toBe(
      'Toyota Hilux 2019, 85.000 km, diésel, automática. Puja actual USD 18.500. Cierra el 03/10/2026 18:00. Vehículo usado certificado por Santa Rosa.',
    );
  });

  it('uses the starting price and the opening time before it opens', () => {
    const scheduled = { ...d, currentBid: 0, status: 'scheduled' as const };
    expect(auctionDescription(scheduled, labels, { kind: 'scheduled', indexable: true })).toContain(
      'Precio de salida USD 10.000. Abre el 01/10/2026 09:00.',
    );
  });
});

describe('auctionMetadata', () => {
  it('is canonical on the single link and indexable while open', () => {
    const m = auctionMetadata(d, labels, live, 'es');
    expect(m.alternates?.canonical).toBe('https://renewsubastas.com.py/es/auctions/auc-1');
    expect(Object.keys(m.alternates?.languages ?? {})).toEqual(['es', 'x-default']);
    expect(m.robots).toBeUndefined();
  });

  it('keeps finished auctions out of the index', () => {
    const m = auctionMetadata(
      d,
      labels,
      { kind: 'finished', result: 'unsold', indexable: false },
      'es',
    );
    expect(m.robots).toEqual({ index: false, follow: true });
  });
});

describe('vehicleJsonLd', () => {
  it('describes the car and its offer in USD until the close', () => {
    const j = vehicleJsonLd(d, labels, live, 'es');
    expect(j['@type']).toBe('Car');
    expect(j['brand']).toEqual({ '@type': 'Brand', name: 'Toyota' });
    expect(j['mileageFromOdometer']).toEqual({
      '@type': 'QuantitativeValue',
      value: 85000,
      unitCode: 'KMT',
    });
    expect(j['offers']).toMatchObject({
      '@type': 'Offer',
      price: 18500,
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
      priceValidUntil: '2026-10-03',
    });
  });

  it('marks a sale as sold out', () => {
    const j = vehicleJsonLd(d, labels, { kind: 'sold-visible', indexable: false }, 'es');
    expect((j['offers'] as Record<string, unknown>)['availability']).toBe(
      'https://schema.org/SoldOut',
    );
  });

  it('never publishes the VIN or the plate', () => {
    expect(JSON.stringify(vehicleJsonLd(d, labels, live, 'es'))).not.toMatch(/vin|licensePlate/i);
  });

  it('omits km and color when missing', () => {
    const j = vehicleJsonLd({ ...d, mileage: null, color: null }, labels, live, 'es');
    expect(j['mileageFromOdometer']).toBeUndefined();
    expect(j['color']).toBeUndefined();
  });

  it('marks a pre-order with scheduled state', () => {
    const j = vehicleJsonLd(d, labels, { kind: 'scheduled', indexable: true }, 'es');
    expect((j['offers'] as Record<string, unknown>)['availability']).toBe(
      'https://schema.org/PreOrder',
    );
  });

  it('marks as sold out when finished with sold result', () => {
    const j = vehicleJsonLd(
      d,
      labels,
      { kind: 'finished', result: 'sold', indexable: false },
      'es',
    );
    expect((j['offers'] as Record<string, unknown>)['availability']).toBe(
      'https://schema.org/SoldOut',
    );
  });

  // La página dice "Subasta finalizada": no puede haber una oferta InStock con precio.
  it.each(['unsold', 'cancelled', 'pending'] as const)(
    'publishes no offer once the auction is over without a sale (%s)',
    (result) => {
      const j = vehicleJsonLd(d, labels, { kind: 'finished', result, indexable: false }, 'es');
      expect(j['@type']).toBe('Car');
      expect(j).not.toHaveProperty('offers');
    },
  );

  it('states the condition of a used vehicle', () => {
    expect(vehicleJsonLd(d, labels, live, 'es')['itemCondition']).toBe(
      'https://schema.org/UsedCondition',
    );
  });

  it('states the condition of a new vehicle', () => {
    expect(vehicleJsonLd({ ...d, condition: 'new' }, labels, live, 'es')['itemCondition']).toBe(
      'https://schema.org/NewCondition',
    );
  });

  it('states the condition of a damaged vehicle', () => {
    expect(vehicleJsonLd({ ...d, condition: 'damaged' }, labels, live, 'es')['itemCondition']).toBe(
      'https://schema.org/DamagedCondition',
    );
  });
});

// "Certificado" es una afirmación que solo vale para un usado (exposición legal).
describe('auctionDescription (condition)', () => {
  it('keeps the certified-used sentence for a used vehicle', () => {
    expect(auctionDescription(d, labels, live)).toMatch(
      / Vehículo usado certificado por Santa Rosa\.$/,
    );
  });

  it('makes no certification claim for a new vehicle', () => {
    expect(auctionDescription({ ...d, condition: 'new' }, labels, live)).toBe(
      'Toyota Hilux 2019, 85.000 km, diésel, automática. Puja actual USD 18.500. Cierra el 03/10/2026 18:00.',
    );
  });

  it('makes no certification claim for a damaged vehicle', () => {
    expect(auctionDescription({ ...d, condition: 'damaged' }, labels, live)).toBe(
      'Toyota Hilux 2019, 85.000 km, diésel, automática. Puja actual USD 18.500. Cierra el 03/10/2026 18:00.',
    );
  });
});

describe('auctionDescription (null fields)', () => {
  it('omits km when mileage is null', () => {
    const descNoMileage = auctionDescription({ ...d, mileage: null }, labels, live);
    expect(descNoMileage).not.toContain('km');
    expect(descNoMileage).toContain('Toyota Hilux 2019, diésel, automática');
  });
});
