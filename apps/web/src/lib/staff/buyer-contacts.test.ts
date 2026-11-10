import { describe, expect, it } from 'vitest';
import { filterBuyerContacts, type BuyerContact } from './buyer-contacts';

const rows: BuyerContact[] = [
  {
    uid: 'a',
    name: 'Ana Pérez',
    email: 'ana@example.com',
    phone: '+595 981 123 456',
    createdAt: 3,
  },
  { uid: 'b', name: 'Luis Gómez', email: 'luis@example.com', phone: '', createdAt: 2 },
  {
    uid: 'c',
    name: 'María Ríos',
    email: 'maria@example.com',
    phone: '0971-555-000',
    createdAt: 1,
  },
];

describe('filterBuyerContacts', () => {
  it('sin búsqueda devuelve todos', () => {
    expect(filterBuyerContacts(rows, '')).toHaveLength(3);
    expect(filterBuyerContacts(rows, '   ')).toHaveLength(3);
  });

  it('busca por nombre sin importar tildes ni mayúsculas', () => {
    expect(filterBuyerContacts(rows, 'perez').map((r) => r.uid)).toEqual(['a']);
    expect(filterBuyerContacts(rows, 'RÍOS').map((r) => r.uid)).toEqual(['c']);
  });

  it('busca por correo', () => {
    expect(filterBuyerContacts(rows, 'luis@').map((r) => r.uid)).toEqual(['b']);
  });

  it('busca por teléfono ignorando espacios, guiones y el +', () => {
    expect(filterBuyerContacts(rows, '981123').map((r) => r.uid)).toEqual(['a']);
    expect(filterBuyerContacts(rows, '971 555').map((r) => r.uid)).toEqual(['c']);
    expect(filterBuyerContacts(rows, '+595981').map((r) => r.uid)).toEqual(['a']);
  });

  it('una búsqueda sin dígitos no coincide con todos los que no tienen teléfono', () => {
    expect(filterBuyerContacts(rows, 'zzz')).toEqual([]);
  });
});
