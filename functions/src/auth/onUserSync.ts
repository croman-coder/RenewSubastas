import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { setUserClaims, clearUserClaims } from '../lib/claims.js';

export const onUserSync = onDocumentWritten(
  { document: 'users/{uid}', region: 'us-central1' },
  async (event) => {
    const after = event.data?.after.data();
    const uid = event.params['uid'] as string;
    if (!after || after['deletedAt']) {
      await clearUserClaims(uid);
      return;
    }
    const role = after['role'] as 'admin' | 'staff' | 'buyer' | undefined;
    const status = after['status'] as 'active' | 'disabled' | undefined;
    if (!role || !status) return;
    // For buyers, mirror profile.audience into the JWT so the client and
    // Firestore rules can filter by audience without extra reads.
    const profile = (after['profile'] ?? {}) as Record<string, unknown>;
    const audience =
      role === 'buyer'
        ? ((profile['audience'] as 'retail' | 'wholesale' | undefined) ?? 'retail')
        : undefined;
    await setUserClaims(uid, {
      role,
      status,
      ...(audience ? { audience } : {}),
    });
  },
);
