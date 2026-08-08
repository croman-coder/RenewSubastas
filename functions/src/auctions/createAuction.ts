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

// The furthest placeBid's anti-sniping extensions are ever allowed to push
// endsAt, measured from the auction's (current) scheduled end. See the
// hardEndsAt comment in packages/shared-types/src/auction.ts.
const MAX_TOTAL_EXTENSION_MS = 30 * 60_000;

const InputSchema = z
  .object({
    vehicleId: z.string().min(1),
    startingPrice: z.number().positive().finite().max(MAX_PRICE_USD),
    reservePrice: z.number().positive().finite().max(MAX_PRICE_USD).optional(),
    buyNowPrice: z.number().positive().finite().max(MAX_PRICE_USD).optional(),
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

    // buyNowPrice must clear the reserve when one is set; with no reserve at
    // all, it falls back to the starting price instead — otherwise a
    // reserve-less auction could open with a Compra Ya price at or below its
    // own starting bid. (reservePrice >= startingPrice is already enforced by
    // the schema refine above, so these two branches can't contradict each
    // other.)
    if (v.buyNowPrice !== undefined) {
      if (v.reservePrice !== undefined) {
        if (v.buyNowPrice <= v.reservePrice) {
          throw new HttpsError(
            'invalid-argument',
            'El precio de Compra ya debe ser mayor al precio objetivo.',
          );
        }
      } else if (v.buyNowPrice <= v.startingPrice) {
        throw new HttpsError(
          'invalid-argument',
          'El precio de Compra ya debe ser mayor al precio inicial.',
        );
      }
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
      ...(v.buyNowPrice !== undefined ? { buyNowPrice: v.buyNowPrice } : {}),
      bidIncrement: v.bidIncrement,
      startsAt: new Date(v.startsAt),
      endsAt: new Date(v.endsAt),
      hardEndsAt: new Date(new Date(v.endsAt).getTime() + MAX_TOTAL_EXTENSION_MS),
      currentBid: 0,
      bidCount: 0,
      status: new Date(v.startsAt).getTime() <= Date.now() ? 'live' : 'scheduled',
      createdBy: actorUid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // reservePrice never touches the buyer-readable parent doc — see
    // AuctionPrivateSchema. Only written when a reserve was actually set.
    if (v.reservePrice !== undefined) {
      tx.set(auctionRef.collection('private').doc('internal'), {
        reservePrice: v.reservePrice,
      });
    }

    tx.update(vehicleRef, {
      status: 'in_auction',
      updatedAt: FieldValue.serverTimestamp(),
      // First time this vehicle goes to market — anchor for the 7-day
      // unsold alert. Re-listings keep the original date.
      ...(vData['firstListedAt'] ? {} : { firstListedAt: FieldValue.serverTimestamp() }),
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
  { region: 'us-central1', enforceAppCheck: process.env['ENFORCE_APP_CHECK'] !== 'false' },
  createAuctionHandler,
);
