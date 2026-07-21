import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '../lib/admin.js';
import { runDailyUnsoldDigest } from './dailyUnsoldDigest.js';

const DAY = 24 * 3600_000;

async function clearAll() {
  for (const c of ['vehicles', 'users', 'auctions']) {
    const docs = await adminDb().collection(c).listDocuments();
    await Promise.all(docs.map((d) => d.delete()));
  }
}

async function seedVehicle(
  id: string,
  opts: { listedDaysAgo?: number; status?: string; alerted?: boolean } = {},
) {
  await adminDb()
    .doc(`vehicles/${id}`)
    .set({
      id,
      make: 'Toyota',
      model: 'Hilux',
      year: 2021,
      status: opts.status ?? 'in_auction',
      createdAt: FieldValue.serverTimestamp(),
      ...(opts.listedDaysAgo !== undefined
        ? { firstListedAt: Timestamp.fromMillis(Date.now() - opts.listedDaysAgo * DAY) }
        : {}),
      ...(opts.alerted ? { unsoldAlertAt: FieldValue.serverTimestamp() } : {}),
    });
}

async function seedStaff(uid: string, email: string) {
  await adminDb().doc(`users/${uid}`).set({ uid, role: 'staff', status: 'active', email });
}

describe('dailyUnsoldDigest', () => {
  beforeEach(clearAll);

  it('emails staff about 7+ day unsold vehicles and marks them', async () => {
    await seedStaff('s1', 'staff@santarosa.com.py');
    await seedVehicle('v-old', { listedDaysAgo: 8 });
    await seedVehicle('v-fresh', { listedDaysAgo: 2 });
    await seedVehicle('v-sold', { listedDaysAgo: 10, status: 'sold' });
    await seedVehicle('v-done', { listedDaysAgo: 10, alerted: true });

    const send = vi.fn().mockResolvedValue({ ok: true });
    const r = await runDailyUnsoldDigest(Date.now(), { send });

    expect(r.alerted).toEqual(['v-old']);
    expect(send).toHaveBeenCalledTimes(1);
    const arg = send.mock.calls[0]![0] as { to: string; subject: string; html: string };
    expect(arg.to).toBe('staff@santarosa.com.py');
    expect(arg.html).toContain('Hilux');

    const v = (await adminDb().doc('vehicles/v-old').get()).data()!;
    expect(v['unsoldAlertAt']).toBeTruthy();
  });

  it('is idempotent — second run alerts nothing', async () => {
    await seedStaff('s1', 'staff@santarosa.com.py');
    await seedVehicle('v-old', { listedDaysAgo: 9 });
    const send = vi.fn().mockResolvedValue({ ok: true });
    await runDailyUnsoldDigest(Date.now(), { send });
    const r2 = await runDailyUnsoldDigest(Date.now(), { send });
    expect(r2.alerted).toEqual([]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does not mark vehicles when the email fails (retries next run)', async () => {
    await seedStaff('s1', 'staff@santarosa.com.py');
    await seedVehicle('v-old', { listedDaysAgo: 8 });
    const send = vi.fn().mockRejectedValue(new Error('resend down'));
    const r = await runDailyUnsoldDigest(Date.now(), { send }).catch(() => ({
      scanned: 0,
      alerted: [] as string[],
    }));
    expect(r.alerted).toEqual([]);
    const v = (await adminDb().doc('vehicles/v-old').get()).data()!;
    expect(v['unsoldAlertAt']).toBeFalsy();
  });
});
