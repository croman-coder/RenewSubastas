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
 * Actividad de un comprador para la ficha del admin. Solo usa consultas que
 * producción ya sirve, así que no necesita índices nuevos:
 *  - pujas y última puja: collectionGroup('bids') por buyerUid CON orderBy
 *    createdAt desc. Ese orderBy no es adorno: el filtro por buyerUid solo
 *    (sin orden) pide un índice de grupo de colecciones de campo único que
 *    producción no tiene (falla con FAILED_PRECONDITION, igual que en
 *    resolveBidders). Con el orderBy la consulta queda cubierta por el
 *    compuesto bids(buyerUid ASC, createdAt DESC) que ya usa listMyBids, y
 *    count() funciona sobre esa misma forma. Cuenta solo pujas con createdAt,
 *    que las escribe placeBid siempre.
 *  - ganadas: auctions por winnerUid + status 'ended' (loadBuyerStats).
 */
export async function loadUserActivity(uid: string): Promise<UserActivity> {
  const db = getFirestore(getAdminApp());
  const bids = db.collectionGroup('bids').where('buyerUid', '==', uid).orderBy('createdAt', 'desc');
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
    orNull(bids.limit(1).get()),
  ]);
  const lastBidAtMs =
    (
      lastBid?.docs[0]?.data()['createdAt'] as { toMillis?: () => number } | undefined
    )?.toMillis?.() ?? null;
  return { bidCount, wonCount, lastBidAtMs };
}
