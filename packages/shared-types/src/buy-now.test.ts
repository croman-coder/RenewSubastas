import { describe, it, expect } from 'vitest';
import { AuctionSchema, AuctionOutcomeSchema } from './auction.js';

const base = {
  id: 'a1',
  vehicleId: 'v1',
  vehicleSnapshot: { make: 'Toyota', model: 'Hilux', year: 2021 },
  startingPrice: 25000,
  bidIncrement: 500,
  startsAt: new Date(),
  endsAt: new Date(Date.now() + 3600_000),
  currentBid: 0,
  bidCount: 0,
  status: 'live' as const,
  createdBy: 'staff-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('campos de Compra ya y venta externa', () => {
  it('acepta buyNowPrice opcional', () => {
    expect(AuctionSchema.safeParse(base).success).toBe(true);
    expect(AuctionSchema.safeParse({ ...base, buyNowPrice: 34000 }).success).toBe(true);
  });

  it('rechaza buyNowPrice no positivo', () => {
    expect(AuctionSchema.safeParse({ ...base, buyNowPrice: 0 }).success).toBe(false);
  });

  it('acepta sold_offline como resultado', () => {
    expect(AuctionOutcomeSchema.safeParse('sold_offline').success).toBe(true);
  });

  it('acepta los campos de venta externa', () => {
    const parsed = AuctionSchema.safeParse({
      ...base,
      status: 'ended' as const,
      outcome: 'sold_offline' as const,
      soldOfflinePriceUsd: 28000,
      soldOfflineAt: new Date(),
      soldOfflineBy: 'staff-uid',
    });
    expect(parsed.success).toBe(true);
  });
});
