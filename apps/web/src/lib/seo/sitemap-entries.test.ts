import { describe, expect, it } from 'vitest';
import { buildSitemap } from './sitemap-entries';

const NOW = new Date('2026-09-26T20:00:00Z');

describe('buildSitemap', () => {
  it('lists the Spanish landing and legal pages, without login or English', () => {
    expect(buildSitemap([], NOW).map((e) => e.url)).toEqual([
      'https://renewsubastas.com.py/es',
      'https://renewsubastas.com.py/es/terminos',
      'https://renewsubastas.com.py/es/privacidad',
      'https://renewsubastas.com.py/es/cookies',
    ]);
  });

  it('adds one entry per open auction on its single link', () => {
    const urls = buildSitemap(['auc-1', 'auc-2'], NOW).map((e) => e.url);
    expect(urls.slice(4)).toEqual([
      'https://renewsubastas.com.py/es/auctions/auc-1',
      'https://renewsubastas.com.py/es/auctions/auc-2',
    ]);
  });

  it('declares only indexed languages as alternates', () => {
    for (const e of buildSitemap(['auc-1'], NOW)) {
      expect(Object.keys(e.alternates?.languages ?? {})).toEqual(['es', 'x-default']);
    }
  });
});
