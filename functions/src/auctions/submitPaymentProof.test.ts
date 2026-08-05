import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { adminDb } from '../lib/admin.js';

// submitPaymentProof talks to real Cloud Storage, which has no emulator
// wired into this test setup (see src/test/setup.ts — only Auth/Firestore
// env vars are set). Storage is mocked here so these tests exercise the
// handler's actual logic (winner/status checks, path binding, rate limit,
// metadata trust, escaping) against the real Firestore emulator, without
// needing new Storage-emulator infra for one file.
interface FakeFile {
  size: number;
  contentType: string;
  content: Buffer;
}
const fakeFiles = new Map<string, FakeFile>();

vi.mock('../lib/admin.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/admin.js')>();
  return {
    ...actual,
    adminStorage: () => ({
      bucket: () => ({
        name: 'test-bucket',
        file: (path: string) => ({
          getMetadata: async () => {
            const f = fakeFiles.get(path);
            if (!f) throw Object.assign(new Error('not found'), { code: 404 });
            return [{ size: f.size, contentType: f.contentType }];
          },
          download: async () => {
            const f = fakeFiles.get(path);
            if (!f) throw new Error('not found');
            return [f.content];
          },
        }),
      }),
    }),
  };
});

interface SentEmail {
  to: string;
  html: string;
  subject: string;
  attachments?: unknown[];
}
const sentEmails: SentEmail[] = [];

vi.mock('../lib/email.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/email.js')>();
  return {
    ...actual,
    sendEmail: async (args: SentEmail) => {
      sentEmails.push(args);
      return { status: 'sent' as const };
    },
  };
});

const { submitPaymentProofHandler } = await import('./submitPaymentProof.js');

const AUCTION_ID = 'auction1';
const WINNER_UID = 'winner1';
const PATH = `payment-proofs/${AUCTION_ID}/${WINNER_UID}/123.jpg`;

function asBuyer(uid: string, data: Record<string, unknown>): CallableRequest {
  return {
    auth: { uid, token: { role: 'buyer', status: 'active' } as never },
    rawRequest: {} as never,
    data,
  } as CallableRequest;
}

async function clearAll() {
  for (const c of ['auctions', 'users', 'rate_limits']) {
    const docs = await adminDb().collection(c).listDocuments();
    await Promise.all(docs.map((d) => d.delete()));
  }
}

async function seedAuction(overrides: Record<string, unknown> = {}) {
  await adminDb()
    .doc(`auctions/${AUCTION_ID}`)
    .set({
      status: 'ended',
      outcome: 'sold',
      winnerUid: WINNER_UID,
      paymentStatus: 'pending_payment',
      finalPrice: 10000,
      vehicleSnapshot: { make: 'Toyota', model: 'Hilux', year: 2020 },
      ...overrides,
    });
}

async function seedUser(overrides: Record<string, unknown> = {}) {
  await adminDb()
    .doc(`users/${WINNER_UID}`)
    .set({
      email: 'winner@example.com',
      profile: { firstName: 'Juan', lastName: 'Pérez', phone: '+595971000111' },
      ...overrides,
    });
}

function registerFile(path: string, opts: Partial<FakeFile> = {}) {
  fakeFiles.set(path, {
    size: opts.size ?? 1000,
    contentType: opts.contentType ?? 'image/jpeg',
    content: opts.content ?? Buffer.from('fake-image-bytes'),
  });
}

describe('submitPaymentProof', () => {
  beforeEach(async () => {
    await clearAll();
    fakeFiles.clear();
    sentEmails.length = 0;
    await seedAuction();
    await seedUser();
    registerFile(PATH);
  });

  it('accepts a valid proof from the actual winner', async () => {
    const res = await submitPaymentProofHandler(
      asBuyer(WINNER_UID, { auctionId: AUCTION_ID, storagePath: PATH }),
    );
    expect(res).toEqual({ ok: true });
    const aSnap = await adminDb().doc(`auctions/${AUCTION_ID}`).get();
    expect(aSnap.data()?.['paymentProofPath']).toBe(PATH);
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]!.attachments).toHaveLength(1);
  });

  it('rejects a non-winner', async () => {
    // Path matches the caller's own uid segment (so the path-binding check
    // passes) — the rejection must come from the winnerUid check itself.
    const otherPath = `payment-proofs/${AUCTION_ID}/someone-else/123.jpg`;
    registerFile(otherPath);
    await expect(
      submitPaymentProofHandler(
        asBuyer('someone-else', { auctionId: AUCTION_ID, storagePath: otherPath }),
      ),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('rejects a storagePath outside this auction/caller prefix', async () => {
    await expect(
      submitPaymentProofHandler(
        asBuyer(WINNER_UID, {
          auctionId: AUCTION_ID,
          storagePath: `payment-proofs/${AUCTION_ID}/someone-else/123.jpg`,
        }),
      ),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('rejects a path-injection attempt in auctionId', async () => {
    await expect(
      submitPaymentProofHandler(asBuyer(WINNER_UID, { auctionId: '../other', storagePath: PATH })),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('rejects once payment is already confirmed', async () => {
    await seedAuction({ paymentStatus: 'paid' });
    await expect(
      submitPaymentProofHandler(asBuyer(WINNER_UID, { auctionId: AUCTION_ID, storagePath: PATH })),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('rejects when the uploaded object does not exist (metadata trust)', async () => {
    fakeFiles.delete(PATH);
    await expect(
      submitPaymentProofHandler(asBuyer(WINNER_UID, { auctionId: AUCTION_ID, storagePath: PATH })),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('rejects an oversized object even if storage.rules were somehow bypassed', async () => {
    registerFile(PATH, { size: 11 * 1024 * 1024 });
    await expect(
      submitPaymentProofHandler(asBuyer(WINNER_UID, { auctionId: AUCTION_ID, storagePath: PATH })),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('rejects a disallowed content type', async () => {
    registerFile(PATH, { contentType: 'application/x-msdownload' });
    await expect(
      submitPaymentProofHandler(asBuyer(WINNER_UID, { auctionId: AUCTION_ID, storagePath: PATH })),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('rate-limits repeated submissions for the same auction', async () => {
    for (let i = 0; i < 5; i++) {
      await submitPaymentProofHandler(
        asBuyer(WINNER_UID, { auctionId: AUCTION_ID, storagePath: PATH }),
      );
    }
    await expect(
      submitPaymentProofHandler(asBuyer(WINNER_UID, { auctionId: AUCTION_ID, storagePath: PATH })),
    ).rejects.toMatchObject({ code: 'resource-exhausted' });
  });

  it('HTML-escapes buyer profile fields in the admin email (stored HTML-injection)', async () => {
    await seedUser({
      profile: {
        firstName: 'Juan',
        lastName: '<img src=x onerror=alert(1)>',
        phone: '+595971000111',
      },
    });
    await submitPaymentProofHandler(
      asBuyer(WINNER_UID, { auctionId: AUCTION_ID, storagePath: PATH }),
    );
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]!.html).not.toContain('<img src=x onerror=alert(1)>');
    expect(sentEmails[0]!.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});
