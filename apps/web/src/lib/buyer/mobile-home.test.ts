import { describe, expect, it } from 'vitest';
import {
  closeProgress,
  commitment,
  pickNextClosing,
  type HomeClosingItem,
  type HomeWinningItem,
} from './mobile-home';

const NOW = Date.parse('2026-09-27T15:00:00Z');
const H = 3_600_000;

const win = (auctionId: string, endsInH: number, currentBid: number): HomeWinningItem => ({
  auctionId,
  make: 'Tesla',
  model: 'Model 3',
  year: 2022,
  thumbnailUrl: null,
  currentBid,
  endsAtMs: NOW + endsInH * H,
});

const closing = (
  id: string,
  endsInH: number,
  currentBid: number,
  startingPrice = 9000,
): HomeClosingItem => ({
  id,
  make: 'Honda',
  model: 'Civic',
  year: 2020,
  thumbnailUrl: 'https://img.test/civic.webp',
  currentBid,
  startingPrice,
  endsAtMs: NOW + endsInH * H,
});

describe('pickNextClosing', () => {
  it('prefers the winning auction that closes first, even over a sooner closing one', () => {
    const next = pickNextClosing(
      {
        myWinning: [win('a', 5, 29000), win('b', 2, 12000)],
        closingSoon: [closing('c', 1, 0)],
        myBidAuctionIds: ['a', 'b'],
      },
      NOW,
    );
    expect(next?.kind).toBe('winning');
    expect(next?.item).toMatchObject({
      auctionId: 'b',
      amountUsd: 12000,
      hasBids: true,
      iBid: true,
      endsAtMs: NOW + 2 * H,
    });
  });

  it('ignores winning auctions whose clock already ran out', () => {
    const next = pickNextClosing(
      {
        myWinning: [win('a', -1, 29000)],
        closingSoon: [closing('c', 3, 0), closing('d', 1, 9500)],
        myBidAuctionIds: ['a'],
      },
      NOW,
    );
    expect(next?.kind).toBe('closing');
    expect(next?.item).toMatchObject({ auctionId: 'd', amountUsd: 9500, hasBids: true });
  });

  it('shows the starting price without bids and knows whether the buyer bid there', () => {
    const base = { myWinning: [], closingSoon: [closing('c', 3, 0, 14000)] };
    const bidBefore = pickNextClosing({ ...base, myBidAuctionIds: ['c'] }, NOW);
    expect(bidBefore?.item).toMatchObject({ amountUsd: 14000, hasBids: false, iBid: true });
    const never = pickNextClosing({ ...base, myBidAuctionIds: [] }, NOW);
    expect(never?.item.iBid).toBe(false);
  });

  it('returns null when nothing is open', () => {
    expect(
      pickNextClosing({ myWinning: [], closingSoon: [], myBidAuctionIds: [] }, NOW),
    ).toBeNull();
    expect(
      pickNextClosing(
        { myWinning: [win('a', -2, 1)], closingSoon: [closing('c', 0, 0)], myBidAuctionIds: [] },
        NOW,
      ),
    ).toBeNull();
  });
});

describe('closeProgress', () => {
  it('is empty with 24 h or more left', () => {
    expect(closeProgress(NOW + 24 * H, NOW)).toBe(0);
    expect(closeProgress(NOW + 30 * H, NOW)).toBe(0);
  });
  it('fills linearly over the last 24 h', () => {
    expect(closeProgress(NOW + 6 * H, NOW)).toBe(0.75);
  });
  it('is full at or after the close', () => {
    expect(closeProgress(NOW, NOW)).toBe(1);
    expect(closeProgress(NOW - H, NOW)).toBe(1);
  });
});

describe('commitment', () => {
  it('adds up what the buyer is winning and the deposit on it', () => {
    expect(commitment([{ currentBid: 29000 }, { currentBid: 12750 }], 0.1)).toEqual({
      totalUsd: 41750,
      depositUsd: 4175,
      count: 2,
    });
  });
  it('rounds the deposit to the dollar', () => {
    expect(commitment([{ currentBid: 12346 }], 0.1).depositUsd).toBe(1235);
    expect(commitment([{ currentBid: 12344 }], 0.1).depositUsd).toBe(1234);
  });
  it('is all zeros when the buyer is winning nothing', () => {
    expect(commitment([], 0.1)).toEqual({ totalUsd: 0, depositUsd: 0, count: 0 });
  });
});
