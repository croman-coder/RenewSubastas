import 'server-only';
import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore } from 'firebase-admin/firestore';

export interface ReadyVehicleOption {
  id: string;
  label: string;
}

// Lists every vehicle in "ready" state regardless of who created it. Staff
// users need to be able to schedule auctions for any ready vehicle in the
// inventory, not only their own drafts.
export async function listReadyVehicles(_uid?: string): Promise<ReadyVehicleOption[]> {
  void _uid;
  const db = getFirestore(getAdminApp());
  try {
    const snap = await db.collection('vehicles').where('status', '==', 'ready').limit(50).get();
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
