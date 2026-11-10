// Lista de contacto de compradores para staff y admin (nombre, teléfono, correo).
// Sin documento ni dirección: staff solo necesita poder comunicarse con ellos.

export interface BuyerContact {
  uid: string;
  name: string;
  email: string;
  /** Tal como se guardó; vacío en cuentas viejas sin teléfono. */
  phone: string;
  createdAt: number;
}

/** Minúsculas y sin tildes, para que "perez" encuentre "Pérez". */
function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Filtra por nombre, correo o teléfono. El teléfono se compara solo por dígitos
 * (ignora espacios, guiones y el +), pero solo si la búsqueda trae dígitos:
 * así "zzz" no coincide con todos los que no tienen teléfono.
 */
export function filterBuyerContacts(items: BuyerContact[], query: string): BuyerContact[] {
  const q = fold(query.trim());
  if (!q) return items;
  const qDigits = q.replace(/\D/g, '');
  return items.filter((r) => {
    if (fold(r.name).includes(q) || fold(r.email).includes(q)) return true;
    return qDigits.length > 0 && r.phone.replace(/\D/g, '').includes(qDigits);
  });
}
