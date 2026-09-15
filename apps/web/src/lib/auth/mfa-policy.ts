import 'server-only';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '@/lib/firebase/admin';
import { parseRequiredRoles } from './mfa-gate';

/**
 * Which roles must present a second factor to get a session cookie. Read
 * from `app_config/global.security.mfaRequiredRoles` on every session mint
 * — one document read per login, which is rare enough not to cache, and
 * caching would delay the one thing this flag exists for: turning
 * enforcement off in seconds if it locks someone out.
 *
 * Written only by `functions/scripts/mfa-enforce.mjs` (Admin SDK). The
 * admin config editor never touches it, and it updates by field path, so
 * it can't erase it either. Missing or malformed reads as `[]` — nobody
 * required — see `parseRequiredRoles`.
 */
export async function loadMfaRequiredRoles(): Promise<string[]> {
  try {
    const snap = await getFirestore(getAdminApp()).doc('app_config/global').get();
    const security = snap.data()?.['security'] as { mfaRequiredRoles?: unknown } | undefined;
    return parseRequiredRoles(security?.mfaRequiredRoles);
  } catch (err) {
    // A Firestore hiccup must not block every login in the building. Log it
    // and let people in; the gate is a hardening layer, and the rest of the
    // session route still enforces status and token validity.
    console.error('[mfa-policy] no se pudo leer app_config/global; gate abierto', err);
    return [];
  }
}
