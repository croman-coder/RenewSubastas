import { describe, it, expect, beforeEach } from 'vitest';
import { adminDb } from '../lib/admin.js';
import { sendEmail, type SendEmailArgs } from '../lib/email.js';
import { buildSoldOfflineEmail, handleAuctionSoldOffline } from './sendAuctionSoldOffline.js';

describe('buildSoldOfflineEmail', () => {
  it('explica que la unidad se vendió en salón', () => {
    const { subject, html } = buildSoldOfflineEmail({
      vehName: 'Toyota Hilux 2021',
      bidderFirstName: 'Juan',
    });
    expect(subject).toContain('Toyota Hilux 2021');
    expect(html).toContain('Juan');
    expect(html).toContain('salón');
  });

  it('escapa el nombre del postor', () => {
    const { html } = buildSoldOfflineEmail({
      vehName: 'Toyota Hilux 2021',
      bidderFirstName: '<b>x</b>',
    });
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });

  it('escapa el nombre del vehículo', () => {
    const { html } = buildSoldOfflineEmail({
      vehName: '<img src=x onerror=alert(1)>',
      bidderFirstName: 'Juan',
    });
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});

// -----------------------------------------------------------------------
// handleAuctionSoldOffline — the trigger predicate + per-bidder fan-out,
// exercised against the live emulator with real before/after-shaped
// fixtures. Mirrors handleAuctionSoldInternal's testing shape in
// ./sendAuctionSoldInternal.test.ts: a `deps.send` recorder that still
// DELEGATES to the real sendEmail (RESEND_API_KEY is unset in this
// environment, so the real call runs its real no-op branch for real — the
// seam only adds an observation point, it does not fake behaviour).
// -----------------------------------------------------------------------
describe('handleAuctionSoldOffline', () => {
  const vehicleSnapshot = { make: 'Toyota', model: 'Hilux', year: 2021 };
  const soldOfflineAfter = (overrides: Record<string, unknown> = {}) => ({
    status: 'ended',
    outcome: 'sold_offline',
    soldOfflinePriceUsd: 28000,
    vehicleSnapshot,
    ...overrides,
  });

  async function clearAll() {
    for (const c of ['users', 'notifications']) {
      const docs = await adminDb().collection(c).listDocuments();
      await Promise.all(docs.map((d) => d.delete()));
    }
  }
  beforeEach(clearAll);

  async function seedBidder(uid: string, firstName: string, email = `${uid}@example.com`) {
    await adminDb().doc(`users/${uid}`).set({ uid, email, profile: { firstName } });
  }

  async function addBid(auctionId: string, buyerUid: string, amount: number) {
    // markSoldOffline has already flipped every 'winning' bid to 'outbid'
    // by the time this trigger's query runs (same transaction that writes
    // sold_offline) — see the handler's docblock for why the query itself
    // doesn't filter by status.
    await adminDb()
      .collection(`auctions/${auctionId}/bids`)
      .add({ auctionId, buyerUid, amount, status: 'outbid' });
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

  it('emails every historical bidder individually, each seeing only their own name', async () => {
    const auctionId = 'sold-offline-basic-1';
    await seedBidder('sold-offline-bidder-1', 'Juan');
    await seedBidder('sold-offline-bidder-2', 'Ana');
    await addBid(auctionId, 'sold-offline-bidder-1', 10000);
    await addBid(auctionId, 'sold-offline-bidder-2', 9500);
    const { sent, deps } = recordingDeps();

    await handleAuctionSoldOffline(
      { auctionId, before: { status: 'live' }, after: soldOfflineAfter() },
      deps,
    );

    expect(sent.length).toBe(2);
    expect(sent.every((s) => typeof s.to === 'string')).toBe(true); // never an array
    const tos = sent.map((s) => s.to).sort();
    expect(tos).toEqual(
      ['sold-offline-bidder-1@example.com', 'sold-offline-bidder-2@example.com'].sort(),
    );

    const for1 = sent.find((s) => s.to === 'sold-offline-bidder-1@example.com')!;
    const for2 = sent.find((s) => s.to === 'sold-offline-bidder-2@example.com')!;
    expect(for1.html).toContain('Juan');
    expect(for1.html).not.toContain('Ana');
    expect(for2.html).toContain('Ana');
    expect(for2.html).not.toContain('Juan');
    // Nobody sees the showroom sale price — it's internal reporting only.
    expect(for1.html).not.toContain('28000');
    expect(for1.html).not.toContain('28.000');
    expect(for2.html).not.toContain('28000');
    expect(for2.html).not.toContain('28.000');
  });

  it('deduplicates a bidder who placed more than one bid on the same auction', async () => {
    const auctionId = 'sold-offline-dedup-1';
    await seedBidder('sold-offline-bidder-3', 'Carlos');
    await addBid(auctionId, 'sold-offline-bidder-3', 8000);
    await addBid(auctionId, 'sold-offline-bidder-3', 8500);
    const { sent, deps } = recordingDeps();

    await handleAuctionSoldOffline(
      { auctionId, before: { status: 'live' }, after: soldOfflineAfter() },
      deps,
    );

    expect(sent.length).toBe(1);
    expect(sent[0]!.to).toBe('sold-offline-bidder-3@example.com');
  });

  it('does not fire for outcome:sold (a real winner — sendAuctionWon/Internal own that)', async () => {
    const auctionId = 'sold-offline-not-sold-1';
    await seedBidder('sold-offline-bidder-4', 'Diego');
    await addBid(auctionId, 'sold-offline-bidder-4', 7000);
    const { sent, deps } = recordingDeps();

    await handleAuctionSoldOffline(
      {
        auctionId,
        before: { status: 'live' },
        after: {
          status: 'ended',
          outcome: 'sold',
          winnerUid: 'sold-offline-bidder-4',
          vehicleSnapshot,
        },
      },
      deps,
    );

    expect(sent.length).toBe(0);
  });

  it('does not fire for outcome:reserve_not_met', async () => {
    const auctionId = 'sold-offline-not-reserve-1';
    await seedBidder('sold-offline-bidder-5', 'Elena');
    await addBid(auctionId, 'sold-offline-bidder-5', 7000);
    const { sent, deps } = recordingDeps();

    await handleAuctionSoldOffline(
      {
        auctionId,
        before: { status: 'live' },
        after: { status: 'ended', outcome: 'reserve_not_met', vehicleSnapshot },
      },
      deps,
    );

    expect(sent.length).toBe(0);
  });

  it('does not fire for outcome:no_bids', async () => {
    const auctionId = 'sold-offline-not-nobids-1';
    const { sent, deps } = recordingDeps();

    await handleAuctionSoldOffline(
      {
        auctionId,
        before: { status: 'live' },
        after: { status: 'ended', outcome: 'no_bids', vehicleSnapshot },
      },
      deps,
    );

    expect(sent.length).toBe(0);
  });

  it('does not fire for outcome:cancelled', async () => {
    const auctionId = 'sold-offline-not-cancelled-1';
    await seedBidder('sold-offline-bidder-6', 'Fabi');
    await addBid(auctionId, 'sold-offline-bidder-6', 7000);
    const { sent, deps } = recordingDeps();

    await handleAuctionSoldOffline(
      {
        auctionId,
        before: { status: 'live' },
        after: { status: 'ended', outcome: 'cancelled', vehicleSnapshot },
      },
      deps,
    );

    expect(sent.length).toBe(0);
  });

  it('does not fire when outcome is sold_offline but status has not transitioned to ended', async () => {
    // Defensive guard, mirroring handleAuctionSoldInternal's belt-and-suspenders
    // status+outcome check — markSoldOffline always writes both fields
    // together, but the guard shouldn't depend on that holding forever.
    const auctionId = 'sold-offline-not-ended-1';
    const { sent, deps } = recordingDeps();

    await handleAuctionSoldOffline(
      {
        auctionId,
        before: { status: 'live' },
        after: { status: 'live', outcome: 'sold_offline', vehicleSnapshot },
      },
      deps,
    );

    expect(sent.length).toBe(0);
  });

  it('does not re-fire when only an unrelated field changes on an already sold_offline auction', async () => {
    const auctionId = 'sold-offline-refire-1';
    await seedBidder('sold-offline-bidder-7', 'Gina');
    await addBid(auctionId, 'sold-offline-bidder-7', 6000);
    const { sent, deps } = recordingDeps();

    const state = soldOfflineAfter();
    await handleAuctionSoldOffline(
      { auctionId, before: state, after: { ...state, updatedAt: 'whatever-changed' } },
      deps,
    );

    expect(sent.length).toBe(0);
  });

  it('skips a bidder with no user doc without throwing, and still emails the rest', async () => {
    const auctionId = 'sold-offline-nouser-1';
    await seedBidder('sold-offline-bidder-8', 'Hugo');
    await addBid(auctionId, 'sold-offline-ghost-uid', 5000); // no users/ doc at all
    await addBid(auctionId, 'sold-offline-bidder-8', 5200);
    const { sent, deps } = recordingDeps();

    await expect(
      handleAuctionSoldOffline(
        { auctionId, before: { status: 'live' }, after: soldOfflineAfter() },
        deps,
      ),
    ).resolves.toBeUndefined();

    expect(sent.length).toBe(1);
    expect(sent[0]!.to).toBe('sold-offline-bidder-8@example.com');
  });

  it('skips a bidder whose user doc has no email without throwing, and still emails the rest', async () => {
    const auctionId = 'sold-offline-noemail-1';
    await adminDb()
      .doc('users/sold-offline-bidder-9')
      .set({ uid: 'sold-offline-bidder-9', profile: { firstName: 'NoEmail' } }); // no email field
    await seedBidder('sold-offline-bidder-10', 'Iris');
    await addBid(auctionId, 'sold-offline-bidder-9', 4000);
    await addBid(auctionId, 'sold-offline-bidder-10', 4200);
    const { sent, deps } = recordingDeps();

    await handleAuctionSoldOffline(
      { auctionId, before: { status: 'live' }, after: soldOfflineAfter() },
      deps,
    );

    expect(sent.length).toBe(1);
    expect(sent[0]!.to).toBe('sold-offline-bidder-10@example.com');
  });

  it('does not throw when vehicleSnapshot is absent, and still emails bidders', async () => {
    const auctionId = 'sold-offline-novehicle-1';
    await seedBidder('sold-offline-bidder-11', 'Karen');
    await addBid(auctionId, 'sold-offline-bidder-11', 4000);
    const { sent, deps } = recordingDeps();

    await expect(
      handleAuctionSoldOffline(
        {
          auctionId,
          before: { status: 'live' },
          after: { status: 'ended', outcome: 'sold_offline' },
        },
        deps,
      ),
    ).resolves.toBeUndefined();

    expect(sent.length).toBe(1);
    expect(sent[0]!.subject).toBeTruthy();
  });

  it('keeps emailing other bidders when the send throws for one of them', async () => {
    const auctionId = 'sold-offline-partial-fail-1';
    await seedBidder('sold-offline-bidder-12', 'Hernan');
    await seedBidder('sold-offline-bidder-13', 'Lucia');
    await addBid(auctionId, 'sold-offline-bidder-12', 3000);
    await addBid(auctionId, 'sold-offline-bidder-13', 3200);

    const sent: SendEmailArgs[] = [];
    const deps = {
      send: async (args: SendEmailArgs) => {
        if (args.to === 'sold-offline-bidder-12@example.com') {
          throw new Error('simulated send failure');
        }
        sent.push(args);
        return sendEmail(args);
      },
    };

    await handleAuctionSoldOffline(
      { auctionId, before: { status: 'live' }, after: soldOfflineAfter() },
      deps,
    );

    expect(sent.length).toBe(1);
    expect(sent[0]!.to).toBe('sold-offline-bidder-13@example.com');
  });

  it('records a per-bidder notification even when the send is skipped for lack of an API key', async () => {
    const auctionId = 'sold-offline-record-1';
    await seedBidder('sold-offline-bidder-14', 'Marco');
    await addBid(auctionId, 'sold-offline-bidder-14', 5000);

    // No deps override here — exercises the real default (deps.send = sendEmail).
    await handleAuctionSoldOffline({
      auctionId,
      before: { status: 'live' },
      after: soldOfflineAfter(),
    });

    const snap = await adminDb()
      .collection('notifications')
      .where('auctionId', '==', auctionId)
      .get();
    expect(snap.size).toBe(1);
    const d = snap.docs[0]!.data();
    expect(d['type']).toBe('auction_sold_offline');
    expect(d['toUid']).toBe('sold-offline-bidder-14');
    expect(d['toEmail']).toBe('sold-offline-bidder-14@example.com');
    expect(d['bidId']).toBeNull();
    expect(d['status']).toBe('skipped');
    expect(d['reason']).toBe('no_api_key');
  });
});
