import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { adminDb, getAdminApp } from '../lib/admin.js';

/**
 * Fans out a "new auction available" push to every active buyer whose
 * audience matches the auction's segment.
 *
 * Fires on two transitions:
 *   1. `created` with status='live'  — admin created an instant-live auction.
 *   2. `scheduled → live`            — the regular scheduler tick promoted it.
 *
 * Strict guards so we never spam:
 *   - We only act on a transition *into* 'live'. Any other write is ignored.
 *   - We bail out if `audience` is missing — there's no safe fanout target.
 *   - We respect each buyer's `preferences.notifications.newAuctionEmail`
 *     preference (re-used for push to keep the user's notification settings
 *     coherent across channels — the buyer already opted in once).
 *   - FCM `sendEachForMulticast` is batched at 500 tokens per call; we
 *     don't expect to exceed that during pilot, but we batch defensively
 *     anyway in case the buyer pool grows.
 *
 * Failure mode: never throws. If FCM is misconfigured, we log and stop
 * so the auction-promotion path (tickAuctions) is never affected by the
 * notification side-effect.
 */
export const sendAuctionLive = onDocumentWritten(
  { document: 'auctions/{auctionId}', region: 'us-central1' },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!after) return;

    const wasLive = before?.['status'] === 'live';
    const isLive = after['status'] === 'live';
    if (wasLive || !isLive) return;

    const audience = after['audience'] as 'retail' | 'wholesale' | undefined;
    if (audience !== 'retail' && audience !== 'wholesale') {
      console.warn('[sendAuctionLive] missing audience, skipping fanout', {
        auctionId: event.params['auctionId'],
      });
      return;
    }

    const auctionId = event.params['auctionId'] as string;
    const v = (after['vehicleSnapshot'] ?? {}) as Record<string, unknown>;
    const make = (v['make'] as string) ?? '';
    const model = (v['model'] as string) ?? '';
    const year = (v['year'] as number) ?? 0;
    const startingPrice = (after['startingPrice'] as number) ?? 0;

    // Pull every active buyer in the matching audience. We could narrow
    // further by `preferences.notifications.newAuctionEmail == true`,
    // but Firestore can't combine that with the audience+status `where`
    // and an `in` query without a composite index — easier to filter
    // in memory below.
    const buyers = await adminDb()
      .collection('users')
      .where('role', '==', 'buyer')
      .where('status', '==', 'active')
      .where('profile.audience', '==', audience)
      .get();

    const tokens: string[] = [];
    for (const u of buyers.docs) {
      const data = u.data();
      const wants =
        (data['preferences']?.notifications?.newAuctionEmail as boolean | undefined) ?? true;
      if (!wants) continue;
      const list = (data['fcmTokens'] as Array<{ token: string }> | undefined) ?? [];
      for (const t of list) {
        if (t.token) tokens.push(t.token);
      }
    }

    if (tokens.length === 0) {
      console.log('[sendAuctionLive] no eligible push tokens', { auctionId, audience });
      return;
    }

    const messaging = getMessaging(getAdminApp());
    const fmtUsd = (n: number) =>
      n.toLocaleString('es-PY', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    const title = `Nueva subasta · ${make} ${model} ${year}`.trim();
    const body = `Desde USD ${fmtUsd(startingPrice)}. Tocá para ver y pujar.`;
    const link = `/es/${audience}`;

    // Batch in slices of 500 (FCM hard limit per multicast call).
    const failedTokens: string[] = [];
    for (let i = 0; i < tokens.length; i += 500) {
      const slice = tokens.slice(i, i + 500);
      try {
        const res = await messaging.sendEachForMulticast({
          tokens: slice,
          notification: { title, body },
          data: {
            url: link,
            tag: `auction-${auctionId}`,
            auctionId,
          },
          webpush: {
            fcmOptions: { link },
            notification: {
              icon: '/icon.png',
              badge: '/icon.png',
              tag: `auction-${auctionId}`,
              renotify: true,
            },
          },
        });
        // Collect failed tokens for cleanup so we don't keep spamming
        // unregistered devices on every future auction.
        res.responses.forEach((r, idx) => {
          if (!r.success && r.error) {
            const code = r.error.code;
            if (
              code === 'messaging/invalid-registration-token' ||
              code === 'messaging/registration-token-not-registered'
            ) {
              failedTokens.push(slice[idx]!);
            }
          }
        });
        console.log('[sendAuctionLive] sent', {
          auctionId,
          audience,
          success: res.successCount,
          failure: res.failureCount,
          batch: slice.length,
        });
      } catch (err) {
        console.error('[sendAuctionLive] multicast threw', { auctionId, audience, err });
      }
    }

    // Best-effort cleanup of dead tokens. We re-read each user's array
    // and write back the filtered set; this is rare-write and small
    // (one user has ≤10 tokens), so the cost is negligible.
    if (failedTokens.length > 0) {
      const failedSet = new Set(failedTokens);
      for (const u of buyers.docs) {
        const list = (u.data()['fcmTokens'] as Array<{ token: string }> | undefined) ?? [];
        const kept = list.filter((t) => !failedSet.has(t.token));
        if (kept.length !== list.length) {
          await u.ref.update({ fcmTokens: kept }).catch(() => {
            /* concurrent write or rules — ignore */
          });
        }
      }
    }
  },
);
