import 'server-only';
import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore } from 'firebase-admin/firestore';

export async function loadFavorites(uid: string): Promise<string[]> {
  const snap = await getFirestore(getAdminApp()).doc(`users/${uid}`).get();
  return ((snap.data()?.['favorites'] ?? []) as string[]) ?? [];
}
