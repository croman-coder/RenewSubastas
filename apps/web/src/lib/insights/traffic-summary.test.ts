import { describe, it, expect } from 'vitest';
import {
  summarizeTrafficHistory,
  buildFunnelSteps,
  funnelBarWidthsPct,
  FUNNEL_STAGES,
  ANONYMOUS_FUNNEL_STAGES,
  SIGNED_IN_FUNNEL_STAGES,
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

// These two describe blocks exercise buildFunnelSteps/funnelBarWidthsPct as
// GENERIC math over an arbitrary ordered stage list — they are decoupled
// from what any particular list of stages MEANS in the product. They use
// the full 4-entry FUNNEL_STAGES purely as "a list of 4", not as an
// endorsement of a combined home->catalog->detail->login funnel — the app
// never actually presents that combination (see the "grouped funnels"
// describe block below for the real usage, and ANONYMOUS_FUNNEL_STAGES's
// doc comment in traffic-summary.ts for why not).
describe('buildFunnelSteps (generic math over an ordered stage list)', () => {
  it('computes count, pctOfFirst, and pctOfPrevious in list order', () => {
    const steps = buildFunnelSteps(
      { home: 400, catalog: 320, detail: 90, login: 4 },
      FUNNEL_STAGES,
    );

    expect(steps).toEqual([
      { stage: 'home', count: 400, pctOfFirst: 100, pctOfPrevious: null },
      { stage: 'catalog', count: 320, pctOfFirst: 80, pctOfPrevious: 80 },
      { stage: 'detail', count: 90, pctOfFirst: 23, pctOfPrevious: 28 },
      { stage: 'login', count: 4, pctOfFirst: 1, pctOfPrevious: 4 },
    ]);
  });

  it('returns null percentages (never NaN or Infinity) when the first stage is zero', () => {
    const steps = buildFunnelSteps({ home: 0, catalog: 0, detail: 2, login: 0 }, FUNNEL_STAGES);

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
    const steps = buildFunnelSteps({ home: 0, catalog: 0, detail: 0, login: 0 }, FUNNEL_STAGES);

    for (const step of steps) {
      expect(step.count).toBe(0);
      expect(step.pctOfFirst).toBeNull();
      expect(Number.isNaN(step.pctOfFirst)).toBe(false);
    }
  });

  it('the first stage in the list always has pctOfPrevious: null (nothing precedes it)', () => {
    const steps = buildFunnelSteps({ home: 10, catalog: 10, detail: 10, login: 10 }, FUNNEL_STAGES);

    expect(steps[0]!.pctOfPrevious).toBeNull();
  });
});

describe('funnelBarWidthsPct (generic math over an ordered stage list)', () => {
  it('agrees with what pctOfFirst would give when the first stage genuinely is the max', () => {
    const widths = funnelBarWidthsPct(
      { home: 400, catalog: 320, detail: 90, login: 4 },
      FUNNEL_STAGES,
    );

    expect(widths).toEqual([100, 80, 23, 1]);
  });

  it('sizes every bar relative to whichever stage is largest, even a middle one', () => {
    const widths = funnelBarWidthsPct(
      { home: 50, catalog: 10, detail: 80, login: 5 },
      FUNNEL_STAGES,
    );

    expect(widths).toEqual([63, 13, 100, 6]);
  });

  it('returns all zeros — never NaN — when every given stage is 0', () => {
    const widths = funnelBarWidthsPct({ home: 0, catalog: 0, detail: 0, login: 0 }, FUNNEL_STAGES);

    expect(widths).toEqual([0, 0, 0, 0]);
    for (const w of widths) expect(Number.isNaN(w)).toBe(false);
  });

  it('every value stays within [0, 100]', () => {
    const cases = [
      { home: 400, catalog: 320, detail: 90, login: 4 },
      { home: 0, catalog: 0, detail: 200, login: 10 },
      { home: 1, catalog: 1000, detail: 1, login: 1 },
    ];
    for (const funnel of cases) {
      for (const w of funnelBarWidthsPct(funnel, FUNNEL_STAGES)) {
        expect(w).toBeGreaterThanOrEqual(0);
        expect(w).toBeLessThanOrEqual(100);
      }
    }
  });

  it('lines up index-for-index with buildFunnelSteps given the same stages list', () => {
    const funnel = { home: 400, catalog: 320, detail: 90, login: 4 };
    const steps = buildFunnelSteps(funnel, FUNNEL_STAGES);
    const widths = funnelBarWidthsPct(funnel, FUNNEL_STAGES);

    expect(steps.map((s) => s.stage)).toEqual(FUNNEL_STAGES);
    expect(widths).toHaveLength(steps.length);
  });
});

// The REAL usage: two disjoint journeys, never one combined funnel. See
// ANONYMOUS_FUNNEL_STAGES/SIGNED_IN_FUNNEL_STAGES's doc comments in
// traffic-summary.ts for the routing evidence.
describe('grouped funnels — ANONYMOUS_FUNNEL_STAGES / SIGNED_IN_FUNNEL_STAGES', () => {
  it('a realistic anonymous funnel (home -> login) computes correctly', () => {
    const funnel = { home: 644, catalog: 503, detail: 180, login: 18 };

    const steps = buildFunnelSteps(funnel, ANONYMOUS_FUNNEL_STAGES);
    expect(steps).toEqual([
      { stage: 'home', count: 644, pctOfFirst: 100, pctOfPrevious: null },
      { stage: 'login', count: 18, pctOfFirst: 3, pctOfPrevious: 3 },
    ]);

    expect(funnelBarWidthsPct(funnel, ANONYMOUS_FUNNEL_STAGES)).toEqual([100, 3]);
  });

  it('a realistic signed-in funnel (catalog -> detail) computes correctly', () => {
    const funnel = { home: 644, catalog: 503, detail: 180, login: 18 };

    const steps = buildFunnelSteps(funnel, SIGNED_IN_FUNNEL_STAGES);
    expect(steps).toEqual([
      { stage: 'catalog', count: 503, pctOfFirst: 100, pctOfPrevious: null },
      { stage: 'detail', count: 180, pctOfFirst: 36, pctOfPrevious: 36 },
    ]);

    expect(funnelBarWidthsPct(funnel, SIGNED_IN_FUNNEL_STAGES)).toEqual([100, 36]);
  });

  it('regression, corrected mechanism: an ad landing on a detail page redirects an anonymous click to /login, not /auctions/{id} — a day can have home:0, login:200', () => {
    // This is the ACTUAL shape the original bug mattered for, corrected
    // from the first version of this test: an Instagram ad linking to a
    // vehicle detail page does NOT produce a `detail` view for an
    // anonymous clicker (that route is behind the login wall) — it
    // produces a `login` view, because the click is redirected there
    // before anything else renders. `detail` for that same visit is 0
    // too, but that's the SIGNED_IN group's problem, not this one's.
    const funnel = { home: 0, catalog: 0, detail: 0, login: 200 };

    const steps = buildFunnelSteps(funnel, ANONYMOUS_FUNNEL_STAGES);
    expect(steps[0]).toEqual({ stage: 'home', count: 0, pctOfFirst: null, pctOfPrevious: null });
    expect(steps[1]).toEqual({ stage: 'login', count: 200, pctOfFirst: null, pctOfPrevious: null });

    // The bar for `login` must render full-width, not collapse to 0%
    // alongside `home` just because `home` (the group's first stage) is 0.
    expect(funnelBarWidthsPct(funnel, ANONYMOUS_FUNNEL_STAGES)).toEqual([0, 100]);
  });

  it('regression: a signed-in session can skip catalog too (shared/bookmarked detail link) — catalog:0, detail large', () => {
    const funnel = { home: 0, catalog: 0, detail: 90, login: 0 };

    expect(funnelBarWidthsPct(funnel, SIGNED_IN_FUNNEL_STAGES)).toEqual([0, 100]);
  });

  it('each group reads ONLY its own two fields — the other group being huge changes nothing', () => {
    // This is the property that matters most: pulling the anonymous
    // journey's numbers must never be influenced by how much signed-in
    // browsing happened that day, or vice versa.
    const funnel = { home: 100, catalog: 999_999, detail: 999_999, login: 50 };

    const anonSteps = buildFunnelSteps(funnel, ANONYMOUS_FUNNEL_STAGES);
    expect(anonSteps.map((s) => s.stage)).toEqual(['home', 'login']);
    expect(anonSteps[1]!.pctOfFirst).toBe(50); // 50/100, unaffected by the 999_999s
    expect(funnelBarWidthsPct(funnel, ANONYMOUS_FUNNEL_STAGES)).toEqual([100, 50]);

    const signedInSteps = buildFunnelSteps(funnel, SIGNED_IN_FUNNEL_STAGES);
    expect(signedInSteps.map((s) => s.stage)).toEqual(['catalog', 'detail']);
    expect(funnelBarWidthsPct(funnel, SIGNED_IN_FUNNEL_STAGES)).toEqual([100, 100]);
  });
});
