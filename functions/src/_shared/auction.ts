import { z } from 'zod';

export const AuctionStatusSchema = z.enum(['scheduled', 'live', 'ended', 'cancelled']);
export type AuctionStatus = z.infer<typeof AuctionStatusSchema>;

export const AuctionOutcomeSchema = z.enum(['sold', 'reserve_not_met', 'no_bids']);

export const VehicleSnapshotSchema = z.object({
  make: z.string(),
  model: z.string(),
  year: z.number().int(),
  thumbnailUrl: z.string().url().optional(),
});

export const AuctionSchema = z.object({
  id: z.string(),
  vehicleId: z.string(),
  vehicleSnapshot: VehicleSnapshotSchema,
  startingPrice: z.number().positive(),
  reservePrice: z.number().positive().optional(),
  bidIncrement: z.number().positive(),
  startsAt: z.date(),
  endsAt: z.date(),
  currentBid: z.number().nonnegative(),
  currentBidderUid: z.string().optional(),
  bidCount: z.number().int().nonnegative(),
  /** Aggregated viewer counters, maintained by the logAuctionView callable. */
  viewStats: z
    .object({ total: z.number().int().nonnegative(), unique: z.number().int().nonnegative() })
    .optional(),
  status: AuctionStatusSchema,
  outcome: AuctionOutcomeSchema.optional(),
  winnerUid: z.string().optional(),
  finalPrice: z.number().positive().optional(),
  createdBy: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Auction = z.infer<typeof AuctionSchema>;
