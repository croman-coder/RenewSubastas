/**
 * Firebase Auth → `auth_users`.
 *
 * `listUsers` pages through every account (1000 per call; today there are
 * ~140). What lands in Postgres is everything the migration will need to
 * recreate the account EXCEPT the password hash: uid, email, providers,
 * custom claims (role/status/audience — the authorization model lives
 * here), timestamps and the disabled flag.
 *
 * Password hashes are deliberately not mirrored. Firebase can export them
 * (`firebase auth:export --format=json`, scrypt with the project's own
 * hash parameters) and Supabase Auth can import that format, so the
 * migration path exists — but a table of 24 password hashes sitting on a
 * server has no business being refreshed every 30 minutes. It is a one-time
 * step, done by hand, on migration day. The 119 Google accounts have no
 * password to export at all.
 */
import { auth } from './firebase.js';
import type { MirrorStore, AuthUserRow } from './store.js';
import { toJson } from './convert.js';
import { log } from './log.js';

export async function authSync(store: MirrorStore): Promise<{ seen: number; deleted: number }> {
  const runId = await store.startRun('auth');
  let seen = 0;
  const uids: string[] = [];
  try {
    let token: string | undefined;
    do {
      const page = await auth().listUsers(1000, token);
      const rows: AuthUserRow[] = page.users.map((u) => ({
        uid: u.uid,
        email: u.email ?? null,
        email_verified: u.emailVerified,
        phone: u.phoneNumber ?? null,
        display_name: u.displayName ?? null,
        photo_url: u.photoURL ?? null,
        disabled: u.disabled,
        providers: u.providerData.map((p) => p.providerId),
        custom_claims: toJson(u.customClaims ?? {}),
        created_at: u.metadata.creationTime
          ? new Date(u.metadata.creationTime).toISOString()
          : null,
        last_sign_in_at: u.metadata.lastSignInTime
          ? new Date(u.metadata.lastSignInTime).toISOString()
          : null,
        last_refresh_at: u.metadata.lastRefreshTime
          ? new Date(u.metadata.lastRefreshTime).toISOString()
          : null,
        tokens_valid_after: u.tokensValidAfterTime
          ? new Date(u.tokensValidAfterTime).toISOString()
          : null,
      }));
      await store.upsertAuthUsers(rows);
      seen += rows.length;
      for (const r of rows) uids.push(r.uid);
      token = page.pageToken;
    } while (token);

    const deleted = await store.softDeleteAuthUsersNotIn(uids);
    await store.finishRun(runId, { ok: true, seen, upserted: seen, deleted });
    log.info(`auth: ${seen} cuentas, ${deleted} dadas de baja`);
    return { seen, deleted };
  } catch (err) {
    await store.finishRun(runId, { ok: false, seen, error: String(err) });
    throw err;
  }
}
