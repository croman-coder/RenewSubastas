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
  // reservePrice deliberately NOT here — it lives in the buyer-unreadable
  // auctions/{id}/private/internal doc (see AuctionPrivateSchema below).
  // Firestore has no field-level read control, so keeping it on this
  // buyer-readable doc meant every bidder could read the reserve straight
  // out of their own onSnapshot subscription and bid exactly that amount.
  bidIncrement: z.number().positive(),
  startsAt: z.date(),
  endsAt: z.date(),
  // Ceiling that buyer-triggered anti-sniping extensions in placeBid may
  // never push endsAt past. Bounds the "two colluding accounts snipe every
  // 59s forever" griefing loop. Recomputed (fresh +30min runway) whenever
  // staff deliberately reschedules/extends; buyer-triggered extensions only
  // ever consume toward it, never reset it. Optional because it's lazily
  // backfilled onto pre-existing auctions the first time placeBid needs it.
  hardEndsAt: z.date().optional(),
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

/**
 * auctions/{id}/private/internal — admin/staff/finanzas read only (see
 * firestore.rules), Admin SDK write only. Holds auction fields with no
 * legitimate buyer-facing use.
 */
export const AuctionPrivateSchema = z.object({
  reservePrice: z.number().positive().optional(),
});
export type AuctionPrivate = z.infer<typeof AuctionPrivateSchema>;
