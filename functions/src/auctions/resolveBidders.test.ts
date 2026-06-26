import { describe, it, expect, beforeEach } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { adminDb } from '../lib/admin.js';
import { resolveBiddersHandler } from './resolveBidders.js';

function asRole(role: string, data: Record<string, unknown>): CallableRequest {
  return {
    auth: { uid: `${role}-uid`, token: { role, status: 'active' } as never },
    rawRequest: {} as never,
    data,
  } as CallableRequest;
}

async function clearUsers() {
  const docs = await adminDb().collection('users').listDocuments();
  await Promise.all(docs.map((d) => d.delete()));
}

describe('resolveBidders', () => {
  beforeEach(async () => {
    await clearUsers();
    await adminDb()
      .doc('users/b1')
      .set({
        uid: 'b1',
        email: 'b1@example.com',
        profile: {
          firstName: 'Juan',
          lastName: 'Pérez',
          phone: '+595971000111',
          documentNumber: '1234567',
        },
      });
  });

  it('returns only name/email/phone for admin', async () => {
    const res = await resolveBiddersHandler(asRole('admin', { uids: ['b1'] }));
    expect(res['b1']).toEqual({
      displayName: 'Juan Pérez',
      email: 'b1@example.com',
      phone: '+595971000111',
    });
    expect((res['b1'] as Record<string, unknown>)['documentNumber']).toBeUndefined();
  });

  it('allows staff', async () => {
    const res = await resolveBiddersHandler(asRole('staff', { uids: ['b1'] }));
    expect(res['b1'].displayName).toBe('Juan Pérez');
  });

  it('rejects finanzas and buyer', async () => {
    await expect(resolveBiddersHandler(asRole('finanzas', { uids: ['b1'] }))).rejects.toMatchObject(
      { code: 'permission-denied' },
    );
    await expect(resolveBiddersHandler(asRole('buyer', { uids: ['b1'] }))).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('omits unknown uids', async () => {
    const res = await resolveBiddersHandler(asRole('admin', { uids: ['b1', 'ghost'] }));
    expect(res['b1']).toBeDefined();
    expect(res['ghost']).toBeUndefined();
  });

  it('rejects batches over the limit', async () => {
    const uids = Array.from({ length: 51 }, (_, i) => `u${i}`);
    await expect(resolveBiddersHandler(asRole('admin', { uids }))).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });
});
