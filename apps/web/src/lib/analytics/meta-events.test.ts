import { describe, it, expect } from 'vitest';
import {
  buildVehiclePayload,
  newEventId,
  purchaseEventId,
  registrationEventId,
  trackAddToCart,
  trackCompleteRegistration,
  trackPurchase,
  trackViewContent,
  vehicleContentName,
} from './meta-events';

const kwid = {
  auctionId: 'oMPocSwsIOn1lnsInRzg',
  make: 'Renault',
  model: 'Kwid Intens',
  year: 2024,
};

describe('vehicleContentName', () => {
  it('joins make, model and year into one label', () => {
    expect(vehicleContentName('Renault', 'Kwid Intens', 2024)).toBe('Renault Kwid Intens 2024');
  });

  it('drops a missing year instead of writing 0', () => {
    expect(vehicleContentName('Renault', 'Kwid Intens', 0)).toBe('Renault Kwid Intens');
  });

  it('tolerates blank fields and stray whitespace without doubling separators', () => {
    expect(vehicleContentName('  Jetour ', 'Dashing', 2025)).toBe('Jetour Dashing 2025');
    expect(vehicleContentName('', 'Dashing', 2025)).toBe('Dashing 2025');
  });
});

describe('buildVehiclePayload', () => {
  it('sends the auction id as the content id, with the price', () => {
    expect(buildVehiclePayload({ ...kwid, value: 4000 })).toEqual({
      content_ids: ['oMPocSwsIOn1lnsInRzg'],
      content_type: 'product',
      content_name: 'Renault Kwid Intens 2024',
      value: 4000,
      currency: 'USD',
    });
  });

  it('snaps a dirty price to cents', () => {
    // A currentBid that ended up as 16002.55555555 must not reach Meta raw —
    // the same defect the bid panel already guards against on screen.
    expect(buildVehiclePayload({ ...kwid, value: 16002.55555555 }).value).toBe(16002.56);
  });

  it('omits value AND currency when there is no usable price', () => {
    // A zero would drag down every value-based report; currency alone is
    // meaningless, so both go together.
    for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const payload = buildVehiclePayload({ ...kwid, value });
      expect(payload.value).toBeUndefined();
      expect(payload.currency).toBeUndefined();
      expect(payload.content_ids).toEqual(['oMPocSwsIOn1lnsInRzg']);
    }
  });
});

describe('event ids', () => {
  it('derives the same purchase id every time, so Meta can collapse duplicates', () => {
    // The reason this is deterministic: the win banner renders on every
    // reload and on every device, and each render would otherwise be a
    // separate sale.
    expect(purchaseEventId('a1', 'u1')).toBe(purchaseEventId('a1', 'u1'));
  });

  it('keeps purchases of different auctions, and by different buyers, apart', () => {
    expect(purchaseEventId('a1', 'u1')).not.toBe(purchaseEventId('a2', 'u1'));
    expect(purchaseEventId('a1', 'u1')).not.toBe(purchaseEventId('a1', 'u2'));
  });

  it('derives one registration id per account', () => {
    expect(registrationEventId('u1')).toBe(registrationEventId('u1'));
    expect(registrationEventId('u1')).not.toBe(registrationEventId('u2'));
  });

  it('mints a fresh id for events that legitimately repeat', () => {
    expect(newEventId()).not.toBe(newEventId());
  });
});

describe('emitting without a browser', () => {
  it('no-ops instead of throwing when there is no window', () => {
    // These calls sit inside success paths — a bid landed, a purchase
    // confirmed. An exception here would swallow the buyer's confirmation.
    // Server-side rendering and unit tests both hit this branch.
    expect(() => trackViewContent({ ...kwid, value: 4000 })).not.toThrow();
    expect(() => trackAddToCart({ ...kwid, value: 4200 })).not.toThrow();
    expect(() => trackPurchase({ ...kwid, value: 4200 }, 'u1')).not.toThrow();
    expect(() => trackCompleteRegistration('email', 'u1')).not.toThrow();
  });
});
