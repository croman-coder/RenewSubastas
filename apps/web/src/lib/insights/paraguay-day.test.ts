import { describe, it, expect } from 'vitest';
import {
  addDays,
  daysInclusive,
  eachDate,
  firstOfMonth,
  isDateKey,
  lastOfMonth,
  paraguayDateKey,
  paraguayDayRangeMs,
  paraguayRangeMs,
} from './paraguay-day';

describe('isDateKey', () => {
  it('accepts a real date', () => {
    expect(isDateKey('2026-09-09')).toBe(true);
    expect(isDateKey('2024-02-29')).toBe(true); // leap year
  });

  it('rejects a date that only LOOKS well formed', () => {
    // The regex matches all of these; only the round-trip catches them.
    expect(isDateKey('2026-02-31')).toBe(false);
    expect(isDateKey('2026-13-01')).toBe(false);
    expect(isDateKey('2026-00-10')).toBe(false);
    expect(isDateKey('2025-02-29')).toBe(false); // not a leap year
  });

  it('rejects wrong shapes and non-strings', () => {
    expect(isDateKey('2026-9-9')).toBe(false);
    expect(isDateKey('09/09/2026')).toBe(false);
    expect(isDateKey('2026-09-09T00:00:00Z')).toBe(false);
    expect(isDateKey('')).toBe(false);
    expect(isDateKey(undefined)).toBe(false);
    expect(isDateKey(20260909)).toBe(false);
  });
});

describe('paraguayDateKey', () => {
  it('reads the LOCAL day, not the UTC one, around local midnight', () => {
    // 2026-09-10T02:30:00Z is 2026-09-09 23:30 in Paraguay (UTC-3).
    expect(paraguayDateKey(Date.UTC(2026, 8, 10, 2, 30))).toBe('2026-09-09');
    // 03:00Z is exactly local midnight — the new local day.
    expect(paraguayDateKey(Date.UTC(2026, 8, 10, 3, 0))).toBe('2026-09-10');
  });
});

describe('paraguayDayRangeMs', () => {
  it('spans local midnight to local midnight, half-open', () => {
    const { startMs, endMs } = paraguayDayRangeMs('2026-09-09');
    expect(startMs).toBe(Date.UTC(2026, 8, 9, 3, 0)); // 00:00 local
    expect(endMs).toBe(Date.UTC(2026, 8, 10, 3, 0)); // 00:00 local next day
    expect(endMs - startMs).toBe(24 * 3600_000);
  });

  it('round-trips with paraguayDateKey at both edges', () => {
    const { startMs, endMs } = paraguayDayRangeMs('2026-09-09');
    expect(paraguayDateKey(startMs)).toBe('2026-09-09');
    expect(paraguayDateKey(endMs - 1)).toBe('2026-09-09');
    // endMs itself already belongs to the NEXT day — this is why callers
    // must use `< endMs`, never `<=`.
    expect(paraguayDateKey(endMs)).toBe('2026-09-10');
  });
});

describe('paraguayRangeMs', () => {
  it('treats `to` as an inclusive calendar day', () => {
    const { startMs, endMs } = paraguayRangeMs('2026-09-01', '2026-09-07');
    expect(startMs).toBe(paraguayDayRangeMs('2026-09-01').startMs);
    // The last instant still inside the range is 23:59:59.999 on the 7th.
    expect(paraguayDateKey(endMs - 1)).toBe('2026-09-07');
    expect(endMs - startMs).toBe(7 * 24 * 3600_000);
  });

  it('covers a single day when from === to', () => {
    const { startMs, endMs } = paraguayRangeMs('2026-09-09', '2026-09-09');
    expect(endMs - startMs).toBe(24 * 3600_000);
  });
});

describe('addDays', () => {
  it('moves forward and backward', () => {
    expect(addDays('2026-09-09', 1)).toBe('2026-09-10');
    expect(addDays('2026-09-09', -1)).toBe('2026-09-08');
    expect(addDays('2026-09-09', 0)).toBe('2026-09-09');
  });

  it('rolls over month and year boundaries in both directions', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-09-01', -1)).toBe('2026-08-31');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29'); // leap
    expect(addDays('2025-02-28', 1)).toBe('2025-03-01'); // non-leap
  });

  it('handles multi-month jumps', () => {
    expect(addDays('2026-09-09', -60)).toBe('2026-07-11');
    expect(addDays('2026-01-15', 365)).toBe('2027-01-15');
  });
});

describe('daysInclusive', () => {
  it('counts both endpoints', () => {
    expect(daysInclusive('2026-09-09', '2026-09-09')).toBe(1);
    expect(daysInclusive('2026-09-03', '2026-09-09')).toBe(7);
    expect(daysInclusive('2026-08-10', '2026-09-09')).toBe(31);
  });

  it('returns 0 — never a negative — for an inverted range', () => {
    expect(daysInclusive('2026-09-09', '2026-09-03')).toBe(0);
  });
});

describe('eachDate', () => {
  it('lists every day oldest first', () => {
    expect(eachDate('2026-08-30', '2026-09-02')).toEqual([
      '2026-08-30',
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
    ]);
  });

  it('is empty for an inverted range and single for an equal one', () => {
    expect(eachDate('2026-09-09', '2026-09-03')).toEqual([]);
    expect(eachDate('2026-09-09', '2026-09-09')).toEqual(['2026-09-09']);
  });

  it('agrees with daysInclusive', () => {
    expect(eachDate('2026-08-10', '2026-09-09')).toHaveLength(
      daysInclusive('2026-08-10', '2026-09-09'),
    );
  });
});

describe('firstOfMonth / lastOfMonth', () => {
  it('finds the month edges', () => {
    expect(firstOfMonth('2026-09-09')).toBe('2026-09-01');
    expect(lastOfMonth('2026-09-09')).toBe('2026-09-30');
    expect(lastOfMonth('2026-08-01')).toBe('2026-08-31');
    expect(lastOfMonth('2026-02-15')).toBe('2026-02-28');
    expect(lastOfMonth('2024-02-15')).toBe('2024-02-29'); // leap
    expect(lastOfMonth('2026-12-25')).toBe('2026-12-31');
  });
});
