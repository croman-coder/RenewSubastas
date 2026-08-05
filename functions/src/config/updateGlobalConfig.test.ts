import { describe, it, expect, beforeEach } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { adminDb } from '../lib/admin.js';
import { updateGlobalConfigHandler } from './updateGlobalConfig.js';

function asAdmin(uid = 'admin-uid', data: Record<string, unknown> = {}): CallableRequest {
  return {
    auth: { uid, token: { role: 'admin', status: 'active' } as never },
    rawRequest: {} as never,
    data,
  } as CallableRequest;
}

function asStaff(data: Record<string, unknown> = {}): CallableRequest {
  return {
    auth: { uid: 'staff-uid', token: { role: 'staff', status: 'active' } as never },
    rawRequest: {} as never,
    data,
  } as CallableRequest;
}

async function clearConfig() {
  await adminDb()
    .doc('app_config/global')
    .delete()
    .catch(() => undefined);
  const logs = await adminDb().collection('audit_logs').listDocuments();
  await Promise.all(logs.map((d) => d.delete()));
}

describe('updateGlobalConfig', () => {
  beforeEach(async () => {
    await clearConfig();
  });

  it('rejects non-admin', async () => {
    await expect(
      updateGlobalConfigHandler(asStaff({ currency: { primary: 'USD' } })),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('rejects invalid currency value', async () => {
    await expect(
      updateGlobalConfigHandler(asAdmin('admin-1', { currency: { primary: 'EUR' } })),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('persists currency section partial update', async () => {
    await updateGlobalConfigHandler(
      asAdmin('admin-1', { currency: { primary: 'USD', pygPerUsd: 7400 } }),
    );
    const snap = await adminDb().doc('app_config/global').get();
    const data = snap.data();
    expect(data?.['currency'].primary).toBe('USD');
    expect(data?.['currency'].pygPerUsd).toBe(7400);
    expect(data?.['updatedBy']).toBe('admin-1');
  });

  it('merges sections without clobbering siblings', async () => {
    await updateGlobalConfigHandler(asAdmin('admin-1', { currency: { primary: 'USD' } }));
    await updateGlobalConfigHandler(
      asAdmin('admin-2', {
        bid: { fixedIncrementUsd: 500, allowManualIncrement: true, antiSnipingSeconds: 60 },
      }),
    );
    const snap = await adminDb().doc('app_config/global').get();
    const data = snap.data();
    expect(data?.['currency'].primary).toBe('USD');
    expect(data?.['bid'].fixedIncrementUsd).toBe(500);
  });

  it('stores the company legal identity used by the public legal pages', async () => {
    await updateGlobalConfigHandler(
      asAdmin('admin-9', {
        company: {
          legalName: 'Santa Rosa Paraguay S.A.',
          ruc: '80012345-6',
          address: 'Avda. Mcal. López 1234, Asunción, Paraguay',
          email: 'legales@example.com',
          phone: '+595 21 000 000',
        },
      }),
    );
    const data = (await adminDb().doc('app_config/global').get()).data();
    expect(data?.['company']).toMatchObject({
      legalName: 'Santa Rosa Paraguay S.A.',
      ruc: '80012345-6',
      address: 'Avda. Mcal. López 1234, Asunción, Paraguay',
    });
  });

  it('rejects a malformed company contact email', async () => {
    await expect(
      updateGlobalConfigHandler(asAdmin('admin-9', { company: { email: 'no-es-un-email' } })),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('leaves other company fields untouched on a partial update', async () => {
    await updateGlobalConfigHandler(
      asAdmin('admin-9', { company: { legalName: 'Original S.A.', ruc: '111' } }),
    );
    await updateGlobalConfigHandler(
      asAdmin('admin-9', { company: { address: 'Nueva dirección' } }),
    );
    const data = (await adminDb().doc('app_config/global').get()).data();
    // Dotted field paths, not a nested object write — a whole-object set here
    // would silently wipe legalName/ruc when only the address is edited.
    expect(data?.['company']).toMatchObject({
      legalName: 'Original S.A.',
      ruc: '111',
      address: 'Nueva dirección',
    });
  });

  it('writes audit log', async () => {
    await updateGlobalConfigHandler(asAdmin('admin-7', { financing: { enabled: true } }));
    const logs = await adminDb()
      .collection('audit_logs')
      .where('action', '==', 'app_config.update')
      .get();
    expect(logs.size).toBe(1);
    expect(logs.docs[0]!.data()['actorUid']).toBe('admin-7');
  });
});
