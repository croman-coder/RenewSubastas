import { describe, expect, it } from 'vitest';
import {
  auctionPath,
  isPublicAuctionId,
  PUBLIC_AUCTION_KEYS,
  toPublicAuctionDetail,
} from './public-auction';

const ts = (iso: string) => ({ toMillis: () => Date.parse(iso) });

const auction = {
  vehicleId: 'veh-1',
  audience: 'retail',
  startingPrice: 10000,
  currentBid: 12500,
  bidCount: 3,
  bidIncrement: 500,
  buyNowPrice: 18000,
  status: 'live',
  outcome: null,
  startsAt: ts('2026-10-01T12:00:00Z'),
  endsAt: ts('2026-10-03T21:00:00Z'),
  // Privado: nunca debe llegar a la forma pública.
  reservePrice: 23456,
  winnerUid: 'uid-winner-secret',
  currentBidderUid: 'uid-bidder-secret',
  paymentStatus: 'pending_payment',
};

const vehicle = {
  make: 'Toyota',
  model: 'Hilux',
  year: 2019,
  vin: '8AJHA3CD1K1234567',
  licensePlate: 'AAAA123',
  mileage: 85000,
  transmission: 'automatic',
  fuelType: 'diesel',
  color: 'Blanco',
  condition: 'used',
  description: { es: 'Única dueña.', en: 'One owner.' },
  images: [
    { url: 'https://img.test/o/a.jpg', thumbnailUrl: 'https://img.test/o/thumbs/a.webp' },
    { url: 'https://img.test/o/b.jpg' },
  ],
};

describe('toPublicAuctionDetail', () => {
  it('exposes exactly the publishable keys', () => {
    const d = toPublicAuctionDetail('auc-1', auction, vehicle)!;
    expect(Object.keys(d).sort()).toEqual([...PUBLIC_AUCTION_KEYS].sort());
  });

  it('never carries VIN, plate, reserve, bidders or payment state', () => {
    const json = JSON.stringify(toPublicAuctionDetail('auc-1', auction, vehicle));
    for (const secret of [
      '8AJHA3CD1K1234567',
      'AAAA123',
      '23456',
      'uid-winner-secret',
      'uid-bidder-secret',
      'pending_payment',
    ]) {
      expect(json).not.toContain(secret);
    }
  });

  it('returns null for a wholesale auction', () => {
    expect(
      toPublicAuctionDetail('auc-1', { ...auction, audience: 'wholesale' }, vehicle),
    ).toBeNull();
  });

  it('treats a missing audience as retail, like firestore.rules', () => {
    const legacy: Record<string, unknown> = { ...auction };
    delete legacy['audience'];
    expect(toPublicAuctionDetail('auc-1', legacy, vehicle)).not.toBeNull();
  });

  it('converts Timestamps to milliseconds and keeps prices and state', () => {
    const d = toPublicAuctionDetail('auc-1', auction, vehicle)!;
    expect(d.startsAtMs).toBe(Date.parse('2026-10-01T12:00:00Z'));
    expect(d.endsAtMs).toBe(Date.parse('2026-10-03T21:00:00Z'));
    expect(d.currentBid).toBe(12500);
    expect(d.buyNowPrice).toBe(18000);
    expect(d.status).toBe('live');
  });

  it('uses the original photo when a thumbnail is missing', () => {
    const d = toPublicAuctionDetail('auc-1', auction, vehicle)!;
    expect(d.images).toEqual([
      { url: 'https://img.test/o/a.jpg', thumbnailUrl: 'https://img.test/o/thumbs/a.webp' },
      { url: 'https://img.test/o/b.jpg', thumbnailUrl: 'https://img.test/o/b.jpg' },
    ]);
  });
});

describe('auctionPath', () => {
  it('builds the single public link of an auction', () => {
    expect(auctionPath('es', 'auc-1')).toBe('/es/auctions/auc-1');
  });
});

describe('isPublicAuctionId', () => {
  it('accepts a Firestore auto-id', () => {
    expect(isPublicAuctionId('Xk3ZpQ9rTbV2mN7wLc1d')).toBe(true);
  });

  it('accepts a seed id with hyphens and underscores', () => {
    expect(isPublicAuctionId('demo-auction-3')).toBe(true);
    expect(isPublicAuctionId('verify_relist')).toBe(true);
  });

  it('rejects a slash, which would turn the id into a subcollection path', () => {
    expect(isPublicAuctionId('auc-1/bids')).toBe(false);
  });

  it('rejects the slash a route handler gets after decoding %2F', () => {
    // `…/x%2Fprivate%2Finternal/opengraph-image-…` llega decodificado al handler.
    expect(isPublicAuctionId(decodeURIComponent('x%2Fprivate%2Finternal'))).toBe(false);
  });

  it('rejects an empty id', () => {
    expect(isPublicAuctionId('')).toBe(false);
  });

  it('accepts up to 128 characters and rejects 129', () => {
    expect(isPublicAuctionId('a'.repeat(128))).toBe(true);
    expect(isPublicAuctionId('a'.repeat(129))).toBe(false);
  });
});
