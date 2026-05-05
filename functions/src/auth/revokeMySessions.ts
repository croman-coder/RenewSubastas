import { onCall } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { adminAuth } from '../lib/admin.js';
import { writeAuditLog } from '../lib/audit.js';
import { requireSignedIn } from '../lib/errors.js';

export interface RevokeMySessionsResult {
  ok: true;
}

export async function revokeMySessionsHandler(
  req: CallableRequest,
): Promise<RevokeMySessionsResult> {
  const { uid } = requireSignedIn(req);
  await adminAuth().revokeRefreshTokens(uid);
  await writeAuditLog({
    actorUid: uid,
    action: 'user.revoke_sessions',
    resourceType: 'user',
    resourceId: uid,
  });
  return { ok: true };
}

export const revokeMySessions = onCall({ region: 'us-central1' }, revokeMySessionsHandler);
