import { adminAuth } from './admin.js';

export interface UserClaims {
  role: 'admin' | 'staff' | 'buyer';
  status: 'active' | 'disabled';
  /**
   * Buyer-only catalog segment. Embedded in the JWT so Firestore rules and
   * client filters can authorise without an extra read on every request.
   * Omitted (undefined) for admin/staff.
   */
  audience?: 'retail' | 'wholesale';
}

export async function setUserClaims(uid: string, claims: UserClaims): Promise<void> {
  await adminAuth().setCustomUserClaims(uid, claims);
}

export async function clearUserClaims(uid: string): Promise<void> {
  await adminAuth().setCustomUserClaims(uid, null);
}
