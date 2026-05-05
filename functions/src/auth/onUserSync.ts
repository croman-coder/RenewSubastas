import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { setUserClaims, clearUserClaims } from '../lib/claims.js';

export const onUserSync = onDocumentWritten(
  { document: 'users/{uid}', region: 'us-central1' },
  async (event) => {
    const after = event.data?.after.data();
    const uid = event.params['uid'] as string;
    if (!after) {
      await clearUserClaims(uid);
      return;
    }
    const role = after['role'] as 'admin' | 'staff' | 'buyer' | undefined;
    const status = after['status'] as 'active' | 'disabled' | undefined;
    if (!role || !status) return;
    await setUserClaims(uid, { role, status });
  },
);
