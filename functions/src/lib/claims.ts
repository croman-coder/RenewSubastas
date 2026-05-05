import { adminAuth } from './admin.js';

export interface UserClaims {
  role: 'admin' | 'staff' | 'buyer';
  status: 'active' | 'disabled';
}

export async function setUserClaims(uid: string, claims: UserClaims): Promise<void> {
  await adminAuth().setCustomUserClaims(uid, claims);
}

export async function clearUserClaims(uid: string): Promise<void> {
  await adminAuth().setCustomUserClaims(uid, null);
}
