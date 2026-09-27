import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import middleware from './middleware';

const SITE = 'https://renewsubastas.com.py';

function run(path: string, cookie?: string) {
  return middleware(new NextRequest(`${SITE}${path}`, cookie ? { headers: { cookie } } : {}));
}

function rewrittenTo(res: Response): string {
  return res.headers.get('x-middleware-rewrite') ?? '';
}

describe('middleware', () => {
  it('lets the per-locale social preview image through instead of rewriting it to 404', () => {
    // The og:image URL Next emits for the landing. It was answering 404 in
    // production (auditoría SEO, 2026-09-26): every WhatsApp/Facebook share
    // rendered without a picture.
    const res = run('/es/opengraph-image?c528af68e91d96a4');
    expect(res.status).not.toBe(404);
    expect(rewrittenTo(res)).not.toContain('_not-found');
  });

  it('still answers 404 for an unknown first segment', () => {
    const res = run('/es/cualquier-cosa');
    expect(res.status).toBe(404);
    expect(rewrittenTo(res)).toContain('/_not-found');
  });

  it('redirects the bare root permanently to /es when no language was chosen', () => {
    const res = run('/');
    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toBe(`${SITE}/es`);
  });

  it('keeps campaign parameters on the root redirect', () => {
    const res = run('/?utm_source=ig&utm_campaign=lote-12');
    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toBe(`${SITE}/es?utm_source=ig&utm_campaign=lote-12`);
  });

  it('leaves a saved language choice at the root to next-intl (temporary redirect)', () => {
    const res = run('/', 'NEXT_LOCALE=en');
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/en');
  });

  it('lets an auction page and its social image through (both are public now)', () => {
    expect(run('/es/auctions/auc-1').status).not.toBe(404);
    expect(run('/es/auctions/auc-1/opengraph-image').status).not.toBe(404);
  });

  it('sends no hreflang Link header (the hreflang lives in each page metadata)', () => {
    // next-intl lo agrega por defecto y anunciaba /en (sin indexar) y un
    // x-default que redirige, en contra del hreflang del HTML.
    expect(run('/es').headers.get('link')).toBeNull();
    expect(run('/es/auctions/auc-1').headers.get('link')).toBeNull();
  });
});
