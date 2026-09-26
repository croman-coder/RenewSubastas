import 'server-only';
import { cache } from 'react';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '@/lib/firebase/admin';
import { pickRelistedAuction, type RelistCandidate } from './relisted';

/**
 * El mismo `where('vehicleId', '==', …)` que la app ya ejecuta en otra parte
 * (insights, dailyUnsoldDigest): índice de un único campo, sin índice compuesto nuevo.
 * Un vehículo tiene un puñado de subastas, así que filtrar en memoria está bien.
 * React's cache() desduplicar la llamada entre generateMetadata y la página.
 */
export const findRelistedAuction = cache(
  async (vehicleId: string, currentId: string): Promise<string | null> => {
    if (!vehicleId) return null;
    const snap = await getFirestore(getAdminApp())
      .collection('auctions')
      .where('vehicleId', '==', vehicleId)
      .get();
    return pickRelistedAuction(
      snap.docs.map((d) => {
        const x = d.data();
        const result: RelistCandidate = {
          id: d.id,
          status: (x['status'] as string | undefined) ?? '',
          endsAtMs: (x['endsAt'] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0,
        };
        const audience = x['audience'] as string | undefined;
        if (audience) {
          result.audience = audience;
        }
        return result;
      }),
      currentId,
    );
  },
);
