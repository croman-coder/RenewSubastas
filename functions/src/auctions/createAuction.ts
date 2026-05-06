import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { adminDb } from '../lib/admin.js';
import { writeAuditLog } from '../lib/audit.js';
import { requireSignedIn } from '../lib/errors.js';
import { FieldValue } from 'firebase-admin/firestore';

// Sane caps to keep typo'd values from polluting the database. These mirror
// the placeBid hard cap and chosen so they cover the realistic top of the
// vehicle market we're targeting.
const MAX_PRICE_USD = 200_000;
const MAX_INCREMENT_USD = 50_000;

const InputSchema = z
  .object({
    vehicleId: z.string().min(1),
    startingPrice: z.number().positive().finite().max(MAX_PRICE_USD),
    reservePrice: z.number().positive().finite().max(MAX_PRICE_USD).optional(),
    bidIncrement: z.number().positive().finite().max(MAX_INCREMENT_USD),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
  })
  .refine((v) => new Date(v.endsAt).getTime() > new Date(v.startsAt).getTime() + 60_000, {
    message: 'endsAt must be at least 1 minute after startsAt',
  })
  .refine((v) => v.reservePrice === undefined || v.reservePrice >= v.startingPrice, {
    message: 'reservePrice must be >= startingPrice',
  });

export interface CreateAuctionResult {
  auctionId: string;
}

export async function createAuctionHandler(req: CallableRequest): Promise<CreateAuctionResult> {
  const { uid: actorUid, role } = requireSignedIn(req);
  if (role !== 'staff' && role !== 'admin') {
    throw new HttpsError('permission-denied', 'Only staff or admin can create auctions');
  }
  const parsed = InputSchema.safeParse(req.data);
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', 'Invalid input', parsed.error.flatten());
  }
  const v = parsed.data;

  const db = adminDb();
  const vehicleRef = db.doc(`vehicles/${v.vehicleId}`);

  const auctionId = await db.runTransaction(async (tx) => {
    const vSnap = await tx.get(vehicleRef);
    if (!vSnap.exists) {
      throw new HttpsError('not-found', 'Vehicle not found');
    }
    const vData = vSnap.data()!;
    if (vData['status'] !== 'ready') {
      throw new HttpsError(
        'failed-precondition',
        `Vehicle status must be "ready" (got "${vData['status']}")`,
      );
    }

    const auctionRef = db.collection('auctions').doc();
    const images = (vData['images'] as Array<{ thumbnailUrl?: string; url?: string }>) ?? [];
    const firstImg = images[0];

    // Inherit the vehicle's audience so the auction is visible to the same
    // buyer segment. Legacy vehicles without `audience` default to retail.
    const audience = (vData['audience'] as 'retail' | 'wholesale' | undefined) ?? 'retail';

    tx.set(auctionRef, {
      id: auctionRef.id,
      vehicleId: v.vehicleId,
      audience,
      vehicleSnapshot: {
        make: vData['make'],
        model: vData['model'],
        year: vData['year'],
        ...(firstImg?.thumbnailUrl ? { thumbnailUrl: firstImg.thumbnailUrl } : {}),
      },
      startingPrice: v.startingPrice,
      ...(v.reservePrice !== undefined && { reservePrice: v.reservePrice }),
      bidIncrement: v.bidIncrement,
      startsAt: new Date(v.startsAt),
      endsAt: new Date(v.endsAt),
      currentBid: 0,
      bidCount: 0,
      status: new Date(v.startsAt).getTime() <= Date.now() ? 'live' : 'scheduled',
      createdBy: actorUid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    tx.update(vehicleRef, {
      status: 'in_auction',
      updatedAt: FieldValue.serverTimestamp(),
    });

    return auctionRef.id;
  });

  await writeAuditLog({
    actorUid,
    action: 'auction.create',
    resourceType: 'auction',
    resourceId: auctionId,
    after: {
      vehicleId: v.vehicleId,
      startingPrice: v.startingPrice,
      startsAt: v.startsAt,
      endsAt: v.endsAt,
    },
  });

  return { auctionId };
}

export const createAuction = onCall(
  { region: 'us-central1', enforceAppCheck: process.env['ENFORCE_APP_CHECK'] === 'true' },
  createAuctionHandler,
);
