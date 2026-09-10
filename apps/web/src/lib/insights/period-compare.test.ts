import { describe, it, expect } from 'vitest';
import { daysInclusive } from './paraguay-day';
import {
  buildComparisonRows,
  comparisonGroups,
  deltaPct,
  isUsableRange,
  lengthsDiffer,
  MAX_PERIOD_DAYS,
  parsePeriodParams,
  perDay,
  periodQueryString,
  presetRange,
  type PeriodTotals,
} from './period-compare';

const TODAY = '2026-09-10';

function totals(over: Partial<PeriodTotals> = {}): PeriodTotals {
  return {
    range: { from: '2026-09-03', to: '2026-09-09' },
    days: 7,
    daysWithTraffic: 7,
    totalViews: 0,
    totalSessions: 0,
    newUsers: 0,
    selfSignups: 0,
    bySource: { ig: 0, fb: 0, google: 0, direct: 0, other: 0 },
    funnel: { home: 0, catalog: 0, detail: 0, login: 0 },
    ...over,
  };
}

describe('presetRange', () => {
  it('never includes today — the rollup for it does not exist yet', () => {
    for (const p of ['7d', '14d', '30d', 'mes'] as const) {
      const { a, b } = presetRange(p, TODAY);
      expect(a.to < TODAY).toBe(true);
      expect(b.to < TODAY).toBe(true);
    }
  });

  it('builds two adjacent equal-length windows ending yesterday', () => {
    const { a, b } = presetRange('7d', TODAY);
    expect(a).toEqual({ from: '2026-09-03', to: '2026-09-09' });
    expect(b).toEqual({ from: '2026-08-27', to: '2026-09-02' });
    expect(daysInclusive(a.from, a.to)).toBe(7);
    expect(daysInclusive(b.from, b.to)).toBe(7);
    // Back to back, no gap and no overlap.
    expect(b.to < a.from).toBe(true);
    expect(daysInclusive(b.from, a.to)).toBe(14);
  });

  it('honours each preset length', () => {
    for (const [preset, len] of [
      ['7d', 7],
      ['14d', 14],
      ['30d', 30],
    ] as const) {
      const { a, b } = presetRange(preset, TODAY);
      expect(daysInclusive(a.from, a.to)).toBe(len);
      expect(daysInclusive(b.from, b.to)).toBe(len);
    }
  });

  it('compares month-to-date against the SAME opening stretch of last month', () => {
    // Today the 10th => 9 closed days this month (1st..9th).
    const { a, b } = presetRange('mes', TODAY);
    expect(a).toEqual({ from: '2026-09-01', to: '2026-09-09' });
    expect(b).toEqual({ from: '2026-08-01', to: '2026-08-09' });
    expect(daysInclusive(b.from, b.to)).toBe(daysInclusive(a.from, a.to));
  });

  it('falls back to the last two complete months on the 1st', () => {
    const { a, b } = presetRange('mes', '2026-09-01');
    expect(a).toEqual({ from: '2026-08-01', to: '2026-08-31' });
    expect(b).toEqual({ from: '2026-07-01', to: '2026-07-31' });
  });

  it('clamps the previous-month window to that month s real length', () => {
    // 31 March: month-to-date is 1..30, but February has no 30th.
    const { a, b } = presetRange('mes', '2026-03-31');
    expect(a).toEqual({ from: '2026-03-01', to: '2026-03-30' });
    expect(b).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(b.to).toBe('2026-02-28');
  });

  it('rolls back across a year boundary', () => {
    const { a, b } = presetRange('7d', '2027-01-03');
    expect(a).toEqual({ from: '2026-12-27', to: '2027-01-02' });
    expect(b).toEqual({ from: '2026-12-20', to: '2026-12-26' });
  });
});

describe('isUsableRange', () => {
  it('accepts a forward range that ends today or earlier', () => {
    expect(isUsableRange({ from: '2026-09-01', to: '2026-09-09' }, TODAY)).toBe(true);
    expect(isUsableRange({ from: TODAY, to: TODAY }, TODAY)).toBe(true);
  });

  it('rejects an inverted range', () => {
    expect(isUsableRange({ from: '2026-09-09', to: '2026-09-01' }, TODAY)).toBe(false);
  });

  it('rejects a future end', () => {
    expect(isUsableRange({ from: '2026-09-01', to: '2026-09-11' }, TODAY)).toBe(false);
  });

  it('rejects a range longer than the cap', () => {
    const from = '2020-01-01';
    expect(daysInclusive(from, TODAY)).toBeGreaterThan(MAX_PERIOD_DAYS);
    expect(isUsableRange({ from, to: TODAY }, TODAY)).toBe(false);
  });
});

describe('parsePeriodParams', () => {
  it('defaults to 7d with no parameters at all', () => {
    const r = parsePeriodParams(undefined, TODAY);
    expect(r.preset).toBe('7d');
    expect(r.a).toEqual({ from: '2026-09-03', to: '2026-09-09' });
  });

  it('resolves a named preset', () => {
    const r = parsePeriodParams({ p: '30d' }, TODAY);
    expect(r.preset).toBe('30d');
    expect(daysInclusive(r.a.from, r.a.to)).toBe(30);
  });

  it('falls back to 7d for an unknown preset', () => {
    expect(parsePeriodParams({ p: 'siempre' }, TODAY).preset).toBe('7d');
  });

  it('takes an explicit four-parameter custom range', () => {
    const r = parsePeriodParams(
      { af: '2026-08-01', at: '2026-08-15', bf: '2026-07-01', bt: '2026-07-15' },
      TODAY,
    );
    expect(r.preset).toBeNull();
    expect(r.a).toEqual({ from: '2026-08-01', to: '2026-08-15' });
    expect(r.b).toEqual({ from: '2026-07-01', to: '2026-07-15' });
  });

  it('does NOT silently complete a half-filled custom range', () => {
    const r = parsePeriodParams({ af: '2026-08-01', at: '2026-08-15' }, TODAY);
    expect(r.preset).toBe('7d');
  });

  it('falls back when a custom date is malformed or impossible', () => {
    const base = { at: '2026-08-15', bf: '2026-07-01', bt: '2026-07-15' };
    expect(parsePeriodParams({ ...base, af: 'ayer' }, TODAY).preset).toBe('7d');
    expect(parsePeriodParams({ ...base, af: '2026-02-31' }, TODAY).preset).toBe('7d');
    expect(parsePeriodParams({ ...base, af: '2026-8-1' }, TODAY).preset).toBe('7d');
  });

  it('falls back for an inverted, future, or oversized custom range', () => {
    expect(
      parsePeriodParams(
        { af: '2026-08-15', at: '2026-08-01', bf: '2026-07-01', bt: '2026-07-15' },
        TODAY,
      ).preset,
    ).toBe('7d');
    expect(
      parsePeriodParams(
        { af: '2026-09-01', at: '2026-12-31', bf: '2026-07-01', bt: '2026-07-15' },
        TODAY,
      ).preset,
    ).toBe('7d');
    expect(
      parsePeriodParams(
        { af: '2020-01-01', at: '2026-09-09', bf: '2026-07-01', bt: '2026-07-15' },
        TODAY,
      ).preset,
    ).toBe('7d');
  });

  it('takes the first value when a parameter repeats', () => {
    const r = parsePeriodParams({ p: ['14d', '30d'] }, TODAY);
    expect(r.preset).toBe('14d');
  });

  it('prefers explicit dates over a preset when both are present', () => {
    const r = parsePeriodParams(
      { p: '30d', af: '2026-08-01', at: '2026-08-15', bf: '2026-07-01', bt: '2026-07-15' },
      TODAY,
    );
    expect(r.preset).toBeNull();
    expect(r.a.from).toBe('2026-08-01');
  });
});

describe('periodQueryString', () => {
  it('round-trips through parsePeriodParams', () => {
    const pair = {
      a: { from: '2026-08-01', to: '2026-08-15' },
      b: { from: '2026-07-01', to: '2026-07-15' },
    };
    const parsed = Object.fromEntries(new URLSearchParams(periodQueryString(pair)));
    const r = parsePeriodParams(parsed, TODAY);
    expect(r.a).toEqual(pair.a);
    expect(r.b).toEqual(pair.b);
    expect(r.preset).toBeNull();
  });
});

describe('deltaPct', () => {
  it('measures A relative to B', () => {
    expect(deltaPct(120, 100)).toBe(20);
    expect(deltaPct(80, 100)).toBe(-20);
    expect(deltaPct(100, 100)).toBe(0);
  });

  it('is null when there is no base to compare against', () => {
    // 0 -> 50 is real growth, but "percent more than nothing" is not a
    // number. deltaAbs carries it instead.
    expect(deltaPct(50, 0)).toBeNull();
    expect(deltaPct(0, 0)).toBeNull();
  });

  it('reads -100% when a metric went to zero', () => {
    expect(deltaPct(0, 40)).toBe(-100);
  });

  it('rounds to whole percent', () => {
    expect(deltaPct(101, 300)).toBe(-66);
  });
});

describe('perDay', () => {
  it('averages to one decimal', () => {
    expect(perDay(700, 7)).toBe(100);
    expect(perDay(100, 7)).toBe(14.3);
  });

  it('returns 0 rather than NaN or Infinity for an empty period', () => {
    expect(perDay(0, 0)).toBe(0);
    expect(perDay(50, 0)).toBe(0);
  });
});

describe('lengthsDiffer', () => {
  it('flags periods of unequal length', () => {
    expect(lengthsDiffer(totals({ days: 7 }), totals({ days: 7 }))).toBe(false);
    expect(lengthsDiffer(totals({ days: 7 }), totals({ days: 30 }))).toBe(true);
  });
});

describe('buildComparisonRows', () => {
  const a = totals({
    totalViews: 625,
    totalSessions: 502,
    newUsers: 14,
    selfSignups: 12,
    bySource: { ig: 357, fb: 221, google: 1, direct: 40, other: 6 },
    funnel: { home: 490, catalog: 5, detail: 5, login: 41 },
  });
  const b = totals({
    range: { from: '2026-08-27', to: '2026-09-02' },
    totalViews: 500,
    totalSessions: 502,
    newUsers: 20,
    selfSignups: 0,
    bySource: { ig: 300, fb: 200, google: 0, direct: 50, other: 4 },
    funnel: { home: 400, catalog: 10, detail: 4, login: 50 },
  });
  const rows = buildComparisonRows(a, b);
  const row = (key: string) => rows.find((r) => r.key === key)!;

  it('covers every recorded metric, once each', () => {
    expect(rows).toHaveLength(13);
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });

  it('computes both deltas per row', () => {
    expect(row('views')).toMatchObject({ a: 625, b: 500, deltaAbs: 125, deltaPct: 25 });
    expect(row('sessions')).toMatchObject({ deltaAbs: 0, deltaPct: 0 });
    expect(row('newUsers')).toMatchObject({ deltaAbs: -6, deltaPct: -30 });
  });

  it('reports a null percentage — not 0 — when B had none of that metric', () => {
    expect(row('src_google')).toMatchObject({ a: 1, b: 0, deltaAbs: 1, deltaPct: null });
    expect(row('selfSignups')).toMatchObject({ a: 12, b: 0, deltaAbs: 12, deltaPct: null });
  });

  it('tags rows with the dataset they come from', () => {
    expect(row('views').source).toBe('traffic');
    expect(row('newUsers').source).toBe('users');
    expect(row('selfSignups').source).toBe('users');
  });

  it('keeps the anonymous and signed-in funnel counters as separate rows', () => {
    // Never divided by one another — two disjoint populations. See
    // ANONYMOUS_FUNNEL_STAGES in traffic-summary.ts.
    expect(row('fn_home').a).toBe(490);
    expect(row('fn_catalog').a).toBe(5);
    expect(row('fn_home').group).toBe(row('fn_catalog').group);
  });

  it('groups rows in reading order', () => {
    expect(comparisonGroups()).toEqual(['Tráfico', 'Registros', 'Origen', 'Recorrido']);
    // Every row's group is one of them.
    const groups = new Set(comparisonGroups());
    for (const r of rows) expect(groups.has(r.group)).toBe(true);
  });
});
