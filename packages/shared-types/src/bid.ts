import { z } from 'zod';

export const BidStatusSchema = z.enum(['valid', 'outbid', 'winning', 'rejected']);

export const BuyerSnapshotSchema = z.object({
  firstName: z.string(),
  lastInitial: z.string().length(1),
});

export const BidSchema = z.object({
  id: z.string(),
  auctionId: z.string(),
  buyerUid: z.string(),
  buyerSnapshot: BuyerSnapshotSchema,
  amount: z.number().positive(),
  createdAt: z.date(),
  ipAddress: z.string().optional(),
  status: BidStatusSchema,
});
export type Bid = z.infer<typeof BidSchema>;
