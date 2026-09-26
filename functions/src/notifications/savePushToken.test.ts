import { describe, it, expect, beforeEach } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '../lib/admin.js';
import { savePushTokenHandler } from './savePushToken.js';

const TOKEN_A = 'fcm-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const TOKEN_B = 'fcm-token-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function asUser(uid: string, token: string): CallableRequest {
  return {
    auth: { uid, token: { role: 'buyer', status: 'active' } as never },
    rawRequest: {} as never,
    data: { token },
  } as CallableRequest;
}

type StoredToken = { token: string; platform: string; updatedAt: Timestamp };

async function storedTokens(uid: string): Promise<StoredToken[]> {
  const snap = await adminDb().doc(`users/${uid}`).get();
  return (snap.data()?.['fcmTokens'] as StoredToken[] | undefined) ?? [];
}

describe('savePushToken', () => {
  beforeEach(async () => {
    const docs = await adminDb().collection('users').listDocuments();
    await Promise.all(docs.map((d) => d.delete()));
  });

  it('rejects unauthenticated calls', async () => {
    const req = { rawRequest: {} as never, data: { token: TOKEN_A } } as CallableRequest;
    await expect(savePushTokenHandler(req)).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  // Production 2026-09-25: every call died with "FieldValue.serverTimestamp()
  // cannot be used inside of an array" — Firestore rejects sentinels inside
  // array elements, so no token was ever stored and every buyer saw
  // "No se pudieron activar las notificaciones".
  it('stores the first token with a concrete timestamp', async () => {
    await adminDb().doc('users/u1').set({ role: 'buyer' });
    await expect(savePushTokenHandler(asUser('u1', TOKEN_A))).resolves.toEqual({ ok: true });
    const tokens = await storedTokens('u1');
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ token: TOKEN_A, platform: 'web' });
    expect(tokens[0]!.updatedAt).toBeInstanceOf(Timestamp);
  });

  it('keeps one entry per device and refreshes a repeated token', async () => {
    await adminDb().doc('users/u2').set({ role: 'buyer' });
    await savePushTokenHandler(asUser('u2', TOKEN_A));
    await savePushTokenHandler(asUser('u2', TOKEN_B));
    await savePushTokenHandler(asUser('u2', TOKEN_A));
    const tokens = await storedTokens('u2');
    expect(tokens.map((t) => t.token)).toEqual([TOKEN_B, TOKEN_A]);
  });
});
