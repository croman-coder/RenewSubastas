import 'server-only';
import { unstable_cache } from 'next/cache';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '@/lib/firebase/admin';
import { toPublicAuctionDetail, type PublicAuctionDetail } from './public-auction';

/**
 * Datos públicos de una subasta, cacheados 30 s por id (spec §4).
 *
 * Lee con el Admin SDK: firestore.rules se quedan como están, y un navegador
 * sin sesión sigue sin poder leer `auctions` o `vehicles`. El cache impide que
 * un link compartido por WhatsApp resulte en dos lecturas de Firestore por
 * visita; visitantes anónimos no pueden pujar, así que 30 s de obsolescencia
 * es inofensivo.
 */
export function loadPublicAuction(id: string): Promise<PublicAuctionDetail | null> {
  return unstable_cache(
    async () => {
      const db = getFirestore(getAdminApp());
      const aSnap = await db.doc(`auctions/${id}`).get();
      if (!aSnap.exists) return null;
      const a = aSnap.data() ?? {};
      const vehicleId = a['vehicleId'] as string | undefined;
      const v = vehicleId ? ((await db.doc(`vehicles/${vehicleId}`).get()).data() ?? {}) : {};
      return toPublicAuctionDetail(id, a, v);
    },
    ['public-auction', id],
    { revalidate: 30 },
  )();
}
