import 'server-only';
import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore } from 'firebase-admin/firestore';
import type { BuyerContact } from './buyer-contacts';

/** Tope de seguridad: la base real son unos cientos de compradores. */
const MAX_BUYERS = 2000;

/**
 * Compradores con su contacto, para la pantalla de staff. Va por Admin SDK
 * (las reglas de Firestore no dejan a staff leer `users/*`) y devuelve solo
 * lo necesario para comunicarse: nombre, teléfono y correo.
 * Quien lo llama debe haber pasado `requireRole(['admin', 'staff'])`.
 */
export async function listBuyerContacts(): Promise<BuyerContact[]> {
  const snap = await getFirestore(getAdminApp())
    .collection('users')
    .where('role', '==', 'buyer')
    .limit(MAX_BUYERS)
    .get();
  const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
  return snap.docs
    .map((d) => {
      const data = d.data();
      const profile = (data['profile'] ?? {}) as Record<string, unknown>;
      const createdAt =
        (data['createdAt'] as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
      return {
        uid: d.id,
        name: `${str(profile['firstName'])} ${str(profile['lastName'])}`.trim() || '(sin nombre)',
        email: str(data['email']),
        phone: str(profile['phone']),
        createdAt,
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}
