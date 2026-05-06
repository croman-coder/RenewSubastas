import 'server-only';
import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore } from 'firebase-admin/firestore';

export interface ReadyVehicleOption {
  id: string;
  label: string;
}

export async function listReadyVehicles(uid: string): Promise<ReadyVehicleOption[]> {
  const db = getFirestore(getAdminApp());
  try {
    const snap = await db
      .collection('vehicles')
      .where('createdBy', '==', uid)
      .where('status', '==', 'ready')
      .limit(50)
      .get();
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        label: `${data['make']} ${data['model']} ${data['year']}`,
      };
    });
  } catch (err) {
    console.warn('[listReadyVehicles] query failed, returning empty list', err);
    return [];
  }
}
