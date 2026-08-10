import { describe, it, expect } from 'vitest';
import {
  summarizeTrafficHistory,
  buildFunnelSteps,
  funnelBarWidthsPct,
  type TrafficDailyAggregate,
} from './traffic-summary';

function day(overrides: Partial<TrafficDailyAggregate> & { date: string }): TrafficDailyAggregate {
  return {
    totalViews: 0,
    uniqueSessions: 0,
    byPathKind: { home: 0, catalog: 0, detail: 0, login: 0, other: 0 },
    bySource: { ig: 0, fb: 0, google: 0, direct: 0, other: 0 },
    funnel: { home: 0, catalog: 0, detail: 0, login: 0 },
    ...overrides,
  };
}

describe('summarizeTrafficHistory', () => {
  it('returns all-zero totals for an empty history, with days: 0', () => {
    const s = summarizeTrafficHistory([]);

    expect(s.days).toBe(0);
    expect(s.totalViews).toBe(0);
    expect(s.totalSessions).toBe(0);
    expect(s.bySource).toEqual({ ig: 0, fb: 0, google: 0, direct: 0, other: 0 });
    expect(s.funnel).toEqual({ home: 0, catalog: 0, detail: 0, login: 0 });
  });

  it('sums totalViews and uniqueSessions across every day in history', () => {
    const history = [
      day({ date: '2026-08-09', totalViews: 100, uniqueSessions: 40 }),
      day({ date: '2026-08-10', totalViews: 150, uniqueSessions: 55 }),
    ];

    const s = summarizeTrafficHistory(history);

    expect(s.days).toBe(2);
    expect(s.totalViews).toBe(250);
    // Sum of each day's OWN unique count, never a cross-day dedupe — a
    // visitor returning tomorrow is a new session by design (see the
    // design doc's "Sin cookies" section). This is the honest, documented
    // shape, not an approximation this function is trying to fix.
    expect(s.totalSessions).toBe(95);
  });

  it('sums bySource and funnel field-by-field across days', () => {
    const history = [
      day({
        date: '2026-08-09',
        bySource: { ig: 10, fb: 2, google: 1, direct: 5, other: 0 },
        funnel: { home: 20, catalog: 12, detail: 3, login: 1 },
      }),
      day({
        date: '2026-08-10',
        bySource: { ig: 8, fb: 0, google: 4, direct: 6, other: 1 },
        funnel: { home: 25, catalog: 10, detail: 4, login: 0 },
      }),
    ];

    const s = summarizeTrafficHistory(history);

    expect(s.bySource).toEqual({ ig: 18, fb: 2, google: 5, direct: 11, other: 1 });
    expect(s.funnel).toEqual({ home: 45, catalog: 22, detail: 7, login: 1 });
  });

  it('does not mutate any of the input day objects', () => {
    const original = day({
      date: '2026-08-09',
      totalViews: 5,
      bySource: { ig: 1, fb: 0, google: 0, direct: 0, other: 0 },
    });
    const snapshot = JSON.parse(JSON.stringify(original)) as TrafficDailyAggregate;

    summarizeTrafficHistory([original]);

    expect(original).toEqual(snapshot);
  });
});

describe('buildFunnelSteps', () => {
  it('computes count, pctOfFirst, and pctOfPrevious for a realistic funnel', () => {
    const steps = buildFunnelSteps({ home: 400, catalog: 320, detail: 90, login: 4 });

    expect(steps).toEqual([
      { stage: 'home', count: 400, pctOfFirst: 100, pctOfPrevious: null },
      { stage: 'catalog', count: 320, pctOfFirst: 80, pctOfPrevious: 80 },
      { stage: 'detail', count: 90, pctOfFirst: 23, pctOfPrevious: 28 },
      { stage: 'login', count: 4, pctOfFirst: 1, pctOfPrevious: 4 },
    ]);
  });

  it('returns null percentages (never NaN or Infinity) when the first stage is zero', () => {
    const steps = buildFunnelSteps({ home: 0, catalog: 0, detail: 2, login: 0 });

    for (const step of steps) {
      expect(step.pctOfFirst).toBeNull();
    }
    // catalog's previous (home) is 0 -> null. detail's previous (catalog) is
    // 0 too, even though detail's own count (2) is not -> still null: you
    // cannot honestly report "retained X% of zero".
    expect(steps.find((s) => s.stage === 'catalog')?.pctOfPrevious).toBeNull();
    expect(steps.find((s) => s.stage === 'detail')?.pctOfPrevious).toBeNull();
  });

  it('is defined over all-zero input with no division-by-zero artifacts', () => {
    const steps = buildFunnelSteps({ home: 0, catalog: 0, detail: 0, login: 0 });

    for (const step of steps) {
      expect(step.count).toBe(0);
      expect(step.pctOfFirst).toBeNull();
      expect(Number.isNaN(step.pctOfFirst)).toBe(false);
    }
  });

  it('the first stage always has pctOfPrevious: null (nothing precedes it)', () => {
    const steps = buildFunnelSteps({ home: 10, catalog: 10, detail: 10, login: 10 });

    expect(steps[0]!.pctOfPrevious).toBeNull();
  });
});

describe('funnelBarWidthsPct', () => {
  it('agrees with a home-is-the-max funnel: same numbers pctOfFirst would give', () => {
    const widths = funnelBarWidthsPct({ home: 400, catalog: 320, detail: 90, login: 4 });

    expect(widths).toEqual({ home: 100, catalog: 80, detail: 23, login: 1 });
  });

  it('regression: sizes a bar off the funnel MAX, not off `home`, when home is 0', () => {
    // Santa Rosa's Instagram ads link straight to a vehicle detail page —
    // a day with zero classified home visits and 200 detail sessions is
    // the expected shape of a good ad day, not a corner case. Detail must
    // render a full-width bar here, not collapse to 0% alongside home.
    const widths = funnelBarWidthsPct({ home: 0, catalog: 0, detail: 200, login: 10 });

    expect(widths).toEqual({ home: 0, catalog: 0, detail: 100, login: 5 });
  });

  it('sizes every bar relative to whichever stage is largest, even a middle one', () => {
    const widths = funnelBarWidthsPct({ home: 50, catalog: 10, detail: 80, login: 5 });

    expect(widths).toEqual({ home: 63, catalog: 13, detail: 100, login: 6 });
  });

  it('returns all zeros — never NaN — for an entirely empty funnel', () => {
    const widths = funnelBarWidthsPct({ home: 0, catalog: 0, detail: 0, login: 0 });

    expect(widths).toEqual({ home: 0, catalog: 0, detail: 0, login: 0 });
    for (const stage of ['home', 'catalog', 'detail', 'login'] as const) {
      expect(Number.isNaN(widths[stage])).toBe(false);
    }
  });

  it('every value stays within [0, 100]', () => {
    const cases = [
      { home: 400, catalog: 320, detail: 90, login: 4 },
      { home: 0, catalog: 0, detail: 200, login: 10 },
      { home: 1, catalog: 1000, detail: 1, login: 1 },
    ];
    for (const funnel of cases) {
      const widths = funnelBarWidthsPct(funnel);
      for (const stage of ['home', 'catalog', 'detail', 'login'] as const) {
        expect(widths[stage]).toBeGreaterThanOrEqual(0);
        expect(widths[stage]).toBeLessThanOrEqual(100);
      }
    }
  });
});
