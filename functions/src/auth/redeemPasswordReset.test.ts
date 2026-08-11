import { describe, it, expect, beforeEach } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { adminAuth, adminDb } from '../lib/admin.js';
import { redeemPasswordResetHandler } from './redeemPasswordReset.js';
import { issuePasswordSetLink } from './reset-tokens.js';

function tokenFromLink(link: string): string {
  return new URL(link).searchParams.get('token')!;
}

function asRequest(data: Record<string, unknown>): CallableRequest {
  return { rawRequest: {} as never, data } as CallableRequest;
}

async function clearAll() {
  const auth = adminAuth();
  const list = await auth.listUsers();
  await Promise.all(list.users.map((u) => auth.deleteUser(u.uid).catch(() => {})));
  for (const c of ['password_set_tokens', 'audit_logs']) {
    const docs = await adminDb().collection(c).listDocuments();
    await Promise.all(docs.map((d) => d.delete()));
  }
}

describe('redeemPasswordReset', () => {
  beforeEach(clearAll);

  // Regression test for the staff/admin/finanzas lockout: createUser.ts
  // always creates accounts with emailVerified:false, and this callable is
  // the ONLY path that ever sets a real password on an invited account
  // (Firebase's own oobCode flow is deliberately not used — see
  // reset-tokens.ts). Without this, every invited account stays
  // permanently unverified even after proving inbox control by clicking
  // the emailed link, which login-form.tsx's unverified-self-registration
  // gate misreads as "never finished signing up".
  it('sets the password AND marks the account emailVerified (receiving the link is proof of inbox control)', async () => {
    await adminAuth().createUser({
      uid: 'inv1',
      email: 'invitee@santarosa.com.py',
      emailVerified: false,
    });
    const link = await issuePasswordSetLink('inv1', 'invitee@santarosa.com.py', 'welcome');
    const res = await redeemPasswordResetHandler(
      asRequest({ token: tokenFromLink(link), password: 'ClaveSegura1' }),
    );
    expect(res).toMatchObject({ ok: true, email: 'invitee@santarosa.com.py' });

    const user = await adminAuth().getUser('inv1');
    expect(user.emailVerified).toBe(true);
  });

  it('works the same for a reset (not just welcome) redemption', async () => {
    await adminAuth().createUser({
      uid: 'inv2',
      email: 'staff2@santarosa.com.py',
      emailVerified: false,
    });
    const link = await issuePasswordSetLink('inv2', 'staff2@santarosa.com.py', 'reset');
    await redeemPasswordResetHandler(
      asRequest({ token: tokenFromLink(link), password: 'OtraClave2' }),
    );
    const user = await adminAuth().getUser('inv2');
    expect(user.emailVerified).toBe(true);
  });

  it('rejects an invalid token and never touches Auth', async () => {
    await expect(
      redeemPasswordResetHandler(
        asRequest({ token: 'not-a-real-token-12345', password: 'ClaveSegura1' }),
      ),
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('rejects a password shorter than 8 characters', async () => {
    await expect(
      redeemPasswordResetHandler(asRequest({ token: 'x'.repeat(20), password: 'short' })),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('rejects redeeming the same token twice', async () => {
    await adminAuth().createUser({
      uid: 'inv3',
      email: 'reused@santarosa.com.py',
      emailVerified: false,
    });
    const link = await issuePasswordSetLink('inv3', 'reused@santarosa.com.py', 'welcome');
    const token = tokenFromLink(link);
    await redeemPasswordResetHandler(asRequest({ token, password: 'PrimeraVez1' }));
    await expect(
      redeemPasswordResetHandler(asRequest({ token, password: 'SegundaVez2' })),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });
});
