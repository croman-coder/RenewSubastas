import { describe, it, expect, beforeEach } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '../lib/admin.js';
import { logPageViewHandler } from './logPageView.js';

// A DocId-shaped session id (see functions/src/lib/ids.ts): what
// crypto.randomUUID() on the client actually produces.
const SESSION_ID = 'a1b2c3d4-e5f6-47a8-9b0c-d1e2f3a4b5c6';

function anon(data: Record<string, unknown>, userAgent?: string): CallableRequest {
  return {
    rawRequest: (userAgent ? { headers: { 'user-agent': userAgent } } : {}) as never,
    data,
  } as CallableRequest;
}

async function clearAll() {
  for (const c of ['page_views', 'rate_limits']) {
    const docs = await adminDb().collection(c).listDocuments();
    await Promise.all(docs.map((d) => d.delete()));
  }
}

async function allPageViews() {
  const snap = await adminDb().collection('page_views').get();
  return snap.docs.map((d) => d.data());
}

describe('logPageView', () => {
  beforeEach(clearAll);

  it('does not require authentication — an anonymous caller writes successfully', async () => {
    // No `auth` key at all, unlike every other callable's tests in this repo.
    // This is the one callable that must work without it.
    const req = anon({ path: '/es', sessionId: SESSION_ID });
    expect(req.auth).toBeUndefined();

    const res = await logPageViewHandler(req);
    expect(res).toEqual({ ok: true, logged: true });

    const views = await allPageViews();
    expect(views).toHaveLength(1);
    expect(views[0]!['sessionId']).toBe(SESSION_ID);
  });

  it('saves a home-page view with exactly the right fields and no others', async () => {
    const res = await logPageViewHandler(anon({ path: '/es', sessionId: SESSION_ID }));
    expect(res).toEqual({ ok: true, logged: true });

    const views = await allPageViews();
    expect(views).toHaveLength(1);
    const view = views[0]!;

    // Exact key set — proves nothing extra (raw path, query string, IP,
    // user-agent) ever reached Firestore, not just that the fields we expect
    // are present.
    expect(Object.keys(view).sort()).toEqual(['at', 'pathKind', 'sessionId', 'source']);
    expect(view['pathKind']).toBe('home');
    expect(view['source']).toBe('direct');
    expect(view['sessionId']).toBe(SESSION_ID);
    expect(view['at']).toBeInstanceOf(Timestamp);
  });

  it('saves a detail-page view with auctionId, and still only the expected fields', async () => {
    const res = await logPageViewHandler(
      anon({ path: '/es/auctions/abc123', sessionId: SESSION_ID, utmSource: 'ig' }),
    );
    expect(res).toEqual({ ok: true, logged: true });

    const views = await allPageViews();
    expect(views).toHaveLength(1);
    const view = views[0]!;

    expect(Object.keys(view).sort()).toEqual([
      'at',
      'auctionId',
      'pathKind',
      'sessionId',
      'source',
    ]);
    expect(view['pathKind']).toBe('detail');
    expect(view['auctionId']).toBe('abc123');
    expect(view['source']).toBe('ig');
  });

  it('classifies source from referrer when there is no utmSource', async () => {
    const res = await logPageViewHandler(
      anon({ path: '/es', sessionId: SESSION_ID, referrer: 'https://www.google.com/' }),
    );
    expect(res).toEqual({ ok: true, logged: true });
    const views = await allPageViews();
    expect(views[0]!['source']).toBe('google');
  });

  it('drops an unparseable auctionId segment on a detail-shaped path instead of storing it raw', async () => {
    // classifyPath only looks at whether a second segment exists, so
    // "some id!" still classifies as 'detail' — but it doesn't match DocId,
    // so it must not be persisted as auctionId.
    const res = await logPageViewHandler(
      anon({ path: '/es/auctions/some id!', sessionId: SESSION_ID }),
    );
    expect(res).toEqual({ ok: true, logged: true });
    const views = await allPageViews();
    const view = views[0]!;
    expect(view['pathKind']).toBe('detail');
    expect(Object.keys(view)).not.toContain('auctionId');
  });

  it('rejects /es/auth/set-password without writing anything', async () => {
    const res = await logPageViewHandler(
      anon({ path: '/es/auth/set-password', sessionId: SESSION_ID }),
    );
    expect(res).toEqual({ ok: true, logged: false });

    // Must assert the collection is empty, not merely that the response says
    // logged:false — a bug that wrote first and reported false anyway would
    // still leak the page view.
    const docs = await adminDb().collection('page_views').listDocuments();
    expect(docs).toHaveLength(0);
  });

  it('rejects /es/auth/action without writing anything', async () => {
    const res = await logPageViewHandler(anon({ path: '/es/auth/action', sessionId: SESSION_ID }));
    expect(res).toEqual({ ok: true, logged: false });

    const docs = await adminDb().collection('page_views').listDocuments();
    expect(docs).toHaveLength(0);
  });

  it('never leaks the query string of a credential-bearing path even if the caller forgot to strip it', async () => {
    const res = await logPageViewHandler(
      anon({ path: '/es/auth/action?oobCode=live-token-123', sessionId: SESSION_ID }),
    );
    expect(res).toEqual({ ok: true, logged: false });
    const docs = await adminDb().collection('page_views').listDocuments();
    expect(docs).toHaveLength(0);
  });

  it('discards a known bot without writing anything', async () => {
    const res = await logPageViewHandler(
      anon(
        { path: '/es', sessionId: SESSION_ID },
        'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      ),
    );
    expect(res).toEqual({ ok: true, logged: false });

    const docs = await adminDb().collection('page_views').listDocuments();
    expect(docs).toHaveLength(0);
  });

  it('a real browser user-agent is not mistaken for a bot', async () => {
    const res = await logPageViewHandler(
      anon(
        { path: '/es', sessionId: SESSION_ID },
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      ),
    );
    expect(res).toEqual({ ok: true, logged: true });
  });

  it('rejects an invalid sessionId', async () => {
    await expect(
      logPageViewHandler(anon({ path: '/es', sessionId: 'not a valid id/with slash' })),
    ).rejects.toMatchObject({ code: 'invalid-argument' });

    await expect(logPageViewHandler(anon({ path: '/es', sessionId: '' }))).rejects.toMatchObject({
      code: 'invalid-argument',
    });

    // Nothing should have been written before the rejection either.
    const docs = await adminDb().collection('page_views').listDocuments();
    expect(docs).toHaveLength(0);
  });

  it('rate limits a hostile client per sessionId (max 30/min)', async () => {
    const now = Date.now();
    await adminDb()
      .doc(`rate_limits/pageview_${SESSION_ID}`)
      .set({ timestamps: Array.from({ length: 30 }, (_, i) => now - i * 1000) });

    await expect(
      logPageViewHandler(anon({ path: '/es', sessionId: SESSION_ID })),
    ).rejects.toMatchObject({ code: 'resource-exhausted' });

    // The rejected call must not have written a page_views doc either.
    const docs = await adminDb().collection('page_views').listDocuments();
    expect(docs).toHaveLength(0);
  });

  it('does not rate-limit two different sessions independently hitting the same page', async () => {
    const otherSession = 'f0e0d0c0-b0a0-4000-8000-000000000000';
    await adminDb()
      .doc(`rate_limits/pageview_${SESSION_ID}`)
      .set({ timestamps: Array.from({ length: 30 }, (_, i) => Date.now() - i * 1000) });

    // SESSION_ID is capped out, but a different session must be unaffected.
    const res = await logPageViewHandler(anon({ path: '/es', sessionId: otherSession }));
    expect(res).toEqual({ ok: true, logged: true });
  });
});
