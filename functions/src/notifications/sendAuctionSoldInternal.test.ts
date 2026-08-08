import { describe, it, expect, beforeEach } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '../lib/admin.js';
import { sendEmail, type SendEmailArgs } from '../lib/email.js';
import { buildInternalSoldEmail, handleAuctionSoldInternal } from './sendAuctionSoldInternal.js';

describe('buildInternalSoldEmail', () => {
  const base = {
    vanity: 'RNW-ABC123',
    vehName: 'Toyota Hilux 2021',
    finalPrice: 34000,
    depositUsd: 3400,
    deadlineText: '9 de agosto, 18:00',
    buyerName: 'Juan Pérez',
    buyerEmail: 'juan@example.com',
    buyerPhone: '+595971000111',
    buyerDoc: 'CI 1234567',
    viaBuyNow: true,
  };

  it('etiqueta la compra directa', () => {
    const { subject, html } = buildInternalSoldEmail(base);
    expect(subject).toContain('Compra ya');
    expect(html).toContain('Compra ya');
  });

  it('etiqueta la subasta ganada', () => {
    const { subject, html } = buildInternalSoldEmail({ ...base, viaBuyNow: false });
    expect(subject).toContain('Subasta ganada');
    expect(html).toContain('Subasta ganada');
  });

  it('escapa el nombre del comprador', () => {
    const { html } = buildInternalSoldEmail({
      ...base,
      buyerName: '<img src=x onerror=alert(1)>',
    });
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('incluye seña y plazo, que es lo que administración necesita', () => {
    const { html } = buildInternalSoldEmail(base);
    expect(html).toContain('3.400');
    expect(html).toContain('9 de agosto, 18:00');
  });

  it('escapa el nombre del vehículo', () => {
    const { html } = buildInternalSoldEmail({
      ...base,
      vehName: '<img src=x onerror=alert(1)>',
    });
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});

// -----------------------------------------------------------------------
// handleAuctionSoldInternal — the trigger predicate + send flow, exercised
// against the live emulator with real before/after-shaped fixtures. Mirrors
// the handleBidOutbid extraction/testing shape in ./sendBidOutbid.ts /
// ./sendBidOutbid.test.ts.
//
// Observability: unlike sendBidOutbid (which persists a `notifications` doc
// via recordNotification), this trigger has no per-recipient Firestore
// record — it's a broadcast, not a per-user notification. There is no seam
// to observe "an email was attempted" without touching sendEmail itself.
// Rather than reach for that silently, this follows the one precedent in
// this codebase for exactly this shape of problem: insights/
// dailyUnsoldDigest.ts injects a `deps.send`, defaulting to the real
// sendEmail, so production is untouched. The recorder below still DELEGATES
// to the real sendEmail after recording — RESEND_API_KEY is unset in this
// environment (proven by every other suite's "skipping send" log), so the
// real call still runs its real no-op branch for real. The seam only adds
// an observation point; it does not fake behaviour.
// -----------------------------------------------------------------------
describe('handleAuctionSoldInternal', () => {
  const vehicleSnapshot = { make: 'Toyota', model: 'Hilux', year: 2021 };

  async function clearUsers() {
    const docs = await adminDb().collection('users').listDocuments();
    await Promise.all(docs.map((d) => d.delete()));
  }
  beforeEach(clearUsers);

  async function seedWinner(uid: string) {
    await adminDb()
      .doc(`users/${uid}`)
      .set({
        uid,
        email: `${uid}@example.com`,
        profile: {
          firstName: 'Juan',
          lastName: 'Pérez',
          phone: '+595971000111',
          documentType: 'CI',
          documentNumber: '1234567',
        },
      });
  }

  function recordingDeps() {
    const sent: SendEmailArgs[] = [];
    return {
      sent,
      deps: {
        send: async (args: SendEmailArgs) => {
          sent.push(args);
          return sendEmail(args);
        },
      },
    };
  }

  const futureDeadline = () => Timestamp.fromMillis(Date.now() + 24 * 3600_000);

  it('fires on expiry close with a winner, labelled "Subasta ganada"', async () => {
    const auctionId = 'sold-internal-expiry-1';
    await seedWinner('sold-internal-winner-1');
    const { sent, deps } = recordingDeps();

    await handleAuctionSoldInternal(
      {
        auctionId,
        before: { status: 'live' },
        after: {
          status: 'ended',
          outcome: 'sold',
          winnerUid: 'sold-internal-winner-1',
          finalPrice: 34000,
          paymentDepositUsd: 3400,
          paymentDeadline: futureDeadline(),
          vehicleSnapshot,
        },
      },
      deps,
    );

    // No admin/staff users seeded beyond the winner (who has no role), so
    // only the unconditional ADMIN_TO should receive it.
    expect(sent.length).toBe(1);
    expect(sent[0]!.to).toBe('administracion@santarosa.com.py');
    expect(sent[0]!.subject).toContain('Subasta ganada');
  });

  it('fires on a buy-now close and selects the "Compra ya" wording from the source:buy_now bid', async () => {
    const auctionId = 'sold-internal-buynow-1';
    await seedWinner('sold-internal-winner-2');
    // buyNow.ts writes this bid in the same transaction as the close —
    // seeding it alongside the sold `after` state reproduces that.
    await adminDb().collection(`auctions/${auctionId}/bids`).add({
      buyerUid: 'sold-internal-winner-2',
      amount: 34000,
      source: 'buy_now',
    });
    const { sent, deps } = recordingDeps();

    await handleAuctionSoldInternal(
      {
        auctionId,
        before: { status: 'live' },
        after: {
          status: 'ended',
          outcome: 'sold',
          winnerUid: 'sold-internal-winner-2',
          finalPrice: 34000,
          paymentDepositUsd: 3400,
          paymentDeadline: futureDeadline(),
          vehicleSnapshot,
        },
      },
      deps,
    );

    expect(sent.length).toBe(1);
    expect(sent[0]!.subject).toContain('Compra ya');
  });

  it('does not fire for outcome:sold_offline', async () => {
    const { sent, deps } = recordingDeps();

    await handleAuctionSoldInternal(
      {
        auctionId: 'sold-internal-offline-1',
        before: { status: 'live' },
        after: {
          status: 'ended',
          outcome: 'sold_offline',
          soldOfflinePriceUsd: 30000,
          vehicleSnapshot,
        },
      },
      deps,
    );

    expect(sent.length).toBe(0);
  });

  it('does not fire for outcome:reserve_not_met', async () => {
    const { sent, deps } = recordingDeps();

    await handleAuctionSoldInternal(
      {
        auctionId: 'sold-internal-reserve-1',
        before: { status: 'live' },
        after: { status: 'ended', outcome: 'reserve_not_met', vehicleSnapshot },
      },
      deps,
    );

    expect(sent.length).toBe(0);
  });

  it('does not fire for outcome:no_bids', async () => {
    const { sent, deps } = recordingDeps();

    await handleAuctionSoldInternal(
      {
        auctionId: 'sold-internal-nobids-1',
        before: { status: 'live' },
        after: { status: 'ended', outcome: 'no_bids', vehicleSnapshot },
      },
      deps,
    );

    expect(sent.length).toBe(0);
  });

  it('does not re-fire when only paymentStatus changes on an already-sold auction', async () => {
    const auctionId = 'sold-internal-refire-1';
    await seedWinner('sold-internal-winner-3');
    const { sent, deps } = recordingDeps();

    const soldState = {
      status: 'ended',
      outcome: 'sold',
      winnerUid: 'sold-internal-winner-3',
      finalPrice: 34000,
      paymentDepositUsd: 3400,
      paymentDeadline: futureDeadline(),
      vehicleSnapshot,
      paymentStatus: 'pending_payment',
    };

    // before is ALREADY ended+sold — only paymentStatus moves in after,
    // exactly what confirmAuctionPayment.ts and tickAuctions.ts's forfeit
    // sweep do to a sold auction.
    await handleAuctionSoldInternal(
      {
        auctionId,
        before: soldState,
        after: { ...soldState, paymentStatus: 'paid' },
      },
      deps,
    );

    expect(sent.length).toBe(0);
  });

  it('does not fire when after is sold but winnerUid is absent', async () => {
    const { sent, deps } = recordingDeps();

    await handleAuctionSoldInternal(
      {
        auctionId: 'sold-internal-nowinner-1',
        before: { status: 'live' },
        after: { status: 'ended', outcome: 'sold', vehicleSnapshot },
      },
      deps,
    );

    expect(sent.length).toBe(0);
  });
});
