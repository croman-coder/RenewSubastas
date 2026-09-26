import { describe, expect, it } from 'vitest';
import sitemap from './sitemap';

describe('sitemap', () => {
  const entries = sitemap();
  const urls = entries.map((e) => e.url);

  it('lists the Spanish landing and legal pages only', () => {
    expect(urls).toEqual([
      'https://renewsubastas.com.py/es',
      'https://renewsubastas.com.py/es/terminos',
      'https://renewsubastas.com.py/es/privacidad',
      'https://renewsubastas.com.py/es/cookies',
    ]);
  });

  it('leaves out the login page and the untranslated English copy', () => {
    expect(urls.some((u) => u.includes('/login'))).toBe(false);
    expect(urls.some((u) => u.includes('/en'))).toBe(false);
  });

  it('declares no English alternate while /en is not indexed', () => {
    for (const e of entries) {
      expect(Object.keys(e.alternates?.languages ?? {})).toEqual(['es', 'x-default']);
    }
  });
});
