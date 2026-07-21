import { describe, it, expect } from 'vitest';
import { AuctionSchema } from './auction.js';
import { VehicleSchema } from './vehicle.js';

const baseAuction = {
  id: 'a1',
  vehicleId: 'v1',
  vehicleSnapshot: { make: 'Toyota', model: 'Corolla', year: 2020 },
  startingPrice: 5000,
  bidIncrement: 100,
  startsAt: new Date(),
  endsAt: new Date(Date.now() + 3600_000),
  currentBid: 0,
  bidCount: 0,
  status: 'live' as const,
  createdBy: 'staff-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('insights schema fields', () => {
  it('AuctionSchema accepts optional viewStats', () => {
    expect(AuctionSchema.safeParse(baseAuction).success).toBe(true);
    expect(
      AuctionSchema.safeParse({ ...baseAuction, viewStats: { total: 12, unique: 5 } }).success,
    ).toBe(true);
  });

  it('VehicleSchema accepts optional firstListedAt/unsoldAlertAt', () => {
    const parsed = VehicleSchema.shape.firstListedAt?.safeParse(new Date());
    expect(parsed?.success).toBe(true);
    const parsed2 = VehicleSchema.shape.unsoldAlertAt?.safeParse(undefined);
    expect(parsed2?.success).toBe(true);
  });
});
