import 'server-only';
import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore } from 'firebase-admin/firestore';

export interface UserActivity {
  /** Total de pujas del comprador; null si la consulta falló. */
  bidCount: number | null;
  /** Subastas ganadas (terminadas con winnerUid = comprador); null si falló. */
  wonCount: number | null;
  /** Fecha de la última puja en ms; null si no pujó nunca o la consulta falló. */
  lastBidAtMs: number | null;
}

async function orNull<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (err) {
    // La ficha del cliente no debe caerse porque falle un dato de actividad.
    console.error('[admin user activity] query failed', err);
    return null;
  }
}

/**
 * Actividad de un comprador para la ficha del admin. Solo usa consultas que la
 * app ya hace, así que no necesita índices nuevos:
 *  - pujas: collectionGroup('bids') por buyerUid (listMyBids / loadBuyerStats);
 *    el conteo es una agregación count(), no lee los documentos.
 *  - última puja: el mismo filtro con orderBy createdAt desc, que es justo el
 *    índice compuesto bids(buyerUid, createdAt desc) de listMyBids; limit(1).
 *  - ganadas: auctions por winnerUid + status 'ended' (loadBuyerStats).
 */
export async function loadUserActivity(uid: string): Promise<UserActivity> {
  const db = getFirestore(getAdminApp());
  const bids = db.collectionGroup('bids').where('buyerUid', '==', uid);
  const [bidCount, wonCount, lastBid] = await Promise.all([
    orNull(
      bids
        .count()
        .get()
        .then((s) => s.data().count),
    ),
    orNull(
      db
        .collection('auctions')
        .where('winnerUid', '==', uid)
        .where('status', '==', 'ended')
        .count()
        .get()
        .then((s) => s.data().count),
    ),
    orNull(bids.orderBy('createdAt', 'desc').limit(1).get()),
  ]);
  const lastBidAtMs =
    (
      lastBid?.docs[0]?.data()['createdAt'] as { toMillis?: () => number } | undefined
    )?.toMillis?.() ?? null;
  return { bidCount, wonCount, lastBidAtMs };
}
