import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { adminDb } from '../lib/admin.js';
import { issuePasswordSetLink, consumePasswordSetToken } from './reset-tokens.js';

const COLLECTION = 'password_set_tokens';

async function clearTokens() {
  const docs = await adminDb().collection(COLLECTION).listDocuments();
  await Promise.all(docs.map((d) => d.delete()));
}

function tokenFromLink(link: string): string {
  return new URL(link).searchParams.get('token')!;
}

describe('reset-tokens', () => {
  beforeEach(async () => {
    await clearTokens();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('issues a token that consumes successfully once', async () => {
    const link = await issuePasswordSetLink('uid-1', 'a@example.com', 'welcome');
    const result = await consumePasswordSetToken(tokenFromLink(link));
    expect(result).toEqual({ uid: 'uid-1', email: 'a@example.com', purpose: 'welcome' });
  });

  it('rejects an unknown token', async () => {
    await expect(consumePasswordSetToken('not-a-real-token')).rejects.toBe('invalid');
  });

  it('rejects a second redemption of the same token (single-use)', async () => {
    const link = await issuePasswordSetLink('uid-2', 'b@example.com', 'reset');
    const token = tokenFromLink(link);
    await consumePasswordSetToken(token);
    await expect(consumePasswordSetToken(token)).rejects.toBe('used');
  });

  it('rejects an expired token', async () => {
    const link = await issuePasswordSetLink('uid-3', 'c@example.com', 'reset');
    const token = tokenFromLink(link);
    // Past the 72h TTL from issuance.
    vi.useFakeTimers({ now: Date.now() + 73 * 3600_000 });
    await expect(consumePasswordSetToken(token)).rejects.toBe('expired');
  });

  it('under concurrent redemption, exactly one caller wins and the other sees "used"', async () => {
    // Regression test for the TOCTOU race: read-then-write split across two
    // separate calls used to let both callers observe usedAt: null before
    // either write landed. Now both reads+writes happen inside one
    // transaction, so Firestore's optimistic concurrency control forces one
    // of the two to retry and correctly observe the already-used token.
    const link = await issuePasswordSetLink('uid-4', 'd@example.com', 'reset');
    const token = tokenFromLink(link);
    const [a, b] = await Promise.allSettled([
      consumePasswordSetToken(token),
      consumePasswordSetToken(token),
    ]);
    const outcomes = [a, b];
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.filter((o): o is PromiseRejectedResult => o.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toBe('used');
  });
});
