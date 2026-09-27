import { describe, expect, it } from 'vitest';
import {
  bidOutcome,
  myAuctionStates,
  ownStatePill,
  type BidOutcomeInput,
} from './my-auction-states';

const entry = (
  auctionId: string,
  over: Partial<BidOutcomeInput> = {},
): BidOutcomeInput & { auctionId: string } => ({
  auctionId,
  auctionStatus: 'live',
  iAmLeading: false,
  iAmWinner: false,
  ...over,
});

describe('bidOutcome', () => {
  it('uses who leads the auction while it is live', () => {
    expect(bidOutcome(entry('a', { iAmLeading: true }))).toBe('winning');
    expect(bidOutcome(entry('a', { iAmLeading: false }))).toBe('outbid');
  });
  it('uses the adjudicated winner once ended', () => {
    expect(bidOutcome(entry('a', { auctionStatus: 'ended', iAmWinner: true }))).toBe('won');
    expect(bidOutcome(entry('a', { auctionStatus: 'ended', iAmWinner: false }))).toBe('lost');
  });
  it('has no outcome for scheduled or cancelled auctions', () => {
    expect(bidOutcome(entry('a', { auctionStatus: 'scheduled' }))).toBeNull();
    expect(bidOutcome(entry('a', { auctionStatus: 'cancelled', iAmLeading: true }))).toBeNull();
  });
});

describe('myAuctionStates', () => {
  it('maps live auctions to winning or outbid', () => {
    const states = myAuctionStates([
      entry('a', { iAmLeading: true }),
      entry('b', { iAmLeading: false }),
    ]);
    expect(states.get('a')).toBe('winning');
    expect(states.get('b')).toBe('outbid');
  });
  it('leaves out ended, scheduled and cancelled auctions', () => {
    const states = myAuctionStates([
      entry('a', { auctionStatus: 'ended', iAmWinner: true }),
      entry('b', { auctionStatus: 'scheduled' }),
      entry('c', { auctionStatus: 'cancelled' }),
    ]);
    expect(states.size).toBe(0);
  });
  it('keeps one state per auction when the buyer bid several times', () => {
    const states = myAuctionStates([
      entry('a', { iAmLeading: true }),
      entry('a', { iAmLeading: true }),
    ]);
    expect([...states.entries()]).toEqual([['a', 'winning']]);
  });
});

describe('ownStatePill', () => {
  const live = { status: 'live' as const, bidCount: 0, buyNowPrice: null };

  it('says the buyer is winning or was outbid first', () => {
    expect(ownStatePill('winning', { ...live, bidCount: 3 })).toEqual({
      variant: 'success',
      label: 'Vas ganando',
    });
    expect(ownStatePill('outbid', { ...live, bidCount: 3 })).toEqual({
      variant: 'danger',
      label: 'Te superaron',
    });
  });
  it('offers Compra ya on a live auction without bids', () => {
    expect(ownStatePill(undefined, { ...live, buyNowPrice: 21000 })).toEqual({
      variant: 'info',
      label: 'Compra ya USD 21.000',
    });
  });
  it('says there are no bids on a live or scheduled auction without them', () => {
    expect(ownStatePill(undefined, live)).toEqual({ variant: 'neutral', label: 'Sin pujas' });
    expect(
      ownStatePill(undefined, { status: 'scheduled', bidCount: 0, buyNowPrice: 21000 }),
    ).toEqual({ variant: 'neutral', label: 'Sin pujas' });
  });
  it('shows nothing for a contested auction of someone else or a closed one', () => {
    expect(ownStatePill(undefined, { ...live, bidCount: 2 })).toBeNull();
    expect(ownStatePill(undefined, { status: 'ended', bidCount: 0, buyNowPrice: null })).toBeNull();
  });
});
