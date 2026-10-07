import { describe, it, expect } from 'vitest';
import {
  USERS_EXPORT_COLUMNS,
  userExportRows,
  usersExportFilename,
  usersExportSubtitle,
} from './users-export';
// Type-only: `list-users.ts` imports 'server-only' and cannot be loaded from a
// vitest run. The import is erased at compile time, so nothing is pulled in.
import type { UserListItem } from './list-users';

function user(overrides: Partial<UserListItem>): UserListItem {
  return {
    uid: 'u1',
    email: 'ana@example.com',
    role: 'buyer',
    audience: 'retail',
    status: 'active',
    firstName: 'Ana',
    lastName: 'Núñez',
    documentType: 'CI',
    documentNumber: '1234567',
    phone: '+595981123456',
    createdAt: 1_760_000_000_000,
    ...overrides,
  };
}

// 12:00 UTC, so the date is the same whether or not a reader assumes UTC-3.
const NOW = new Date('2026-08-14T12:00:00.000Z');

describe('USERS_EXPORT_COLUMNS', () => {
  it('lleva los datos de contacto que el equipo necesita para llamar al cliente', () => {
    expect(USERS_EXPORT_COLUMNS.map((c) => c.header)).toEqual([
      'Nombre',
      'Email',
      'Teléfono',
      'Documento',
      'Alta',
    ]);
  });

  it('fills the A4 content width in the PDF (595pt page, 48pt margins)', () => {
    const total = USERS_EXPORT_COLUMNS.reduce((sum, c) => sum + c.pdfWidth, 0);
    expect(total).toBe(595 - 48 * 2);
  });
});

describe('userExportRows', () => {
  it('joins first and last name into a single Nombre cell', () => {
    expect(userExportRows([user({})])[0]![0]).toBe('Ana Núñez');
    expect(userExportRows([user({})])[0]![1]).toBe('ana@example.com');
  });

  it('exporta el teléfono normalizado con prefijo internacional', () => {
    expect(userExportRows([user({ phone: '0981 123 456' })])[0]![2]).toBe('+595981123456');
    expect(userExportRows([user({ phone: '+595981123456' })])[0]![2]).toBe('+595981123456');
  });

  it('deja vacío el teléfono que falta y conserva tal cual uno que no se puede normalizar', () => {
    expect(userExportRows([user({ phone: '' })])[0]![2]).toBe('');
    expect(userExportRows([user({ phone: '12 34' })])[0]![2]).toBe('12 34');
  });

  it('une tipo y número de documento, y deja vacío si no hay número', () => {
    expect(userExportRows([user({})])[0]![3]).toBe('CI 1234567');
    expect(
      userExportRows([user({ documentType: 'RUC', documentNumber: '80012345-6' })])[0]![3],
    ).toBe('RUC 80012345-6');
    expect(userExportRows([user({ documentNumber: '' })])[0]![3]).toBe('');
  });

  it('formatea el alta solo con la fecha, en hora de Paraguay', () => {
    // 1_760_000_000_000 ms = 2025-10-09T08:53:20Z = 05:53 en UTC-3.
    expect(userExportRows([user({})])[0]![4]).toBe('09/10/2025');
    expect(userExportRows([user({ createdAt: 0 })])[0]![4]).toBe('');
  });

  it('trims the separator when half the name is missing', () => {
    expect(userExportRows([user({ lastName: '' })])[0]![0]).toBe('Ana');
    expect(userExportRows([user({ firstName: '' })])[0]![0]).toBe('Núñez');
    expect(userExportRows([user({ firstName: '', lastName: '' })])[0]![0]).toBe('');
  });

  it('preserves the order it is given — newest first, like the table', () => {
    const rows = userExportRows([
      user({ firstName: 'Ana', lastName: '' }),
      user({ firstName: 'Ben', lastName: '' }),
    ]);
    expect(rows.map((r) => r[0])).toEqual(['Ana', 'Ben']);
  });
});

describe('usersExportFilename', () => {
  it('names the file by format and UTC date', () => {
    expect(usersExportFilename('xlsx', NOW)).toBe('usuarios-2026-08-14.xlsx');
    expect(usersExportFilename('pdf', NOW)).toBe('usuarios-2026-08-14.pdf');
  });

  it('stays ASCII so Content-Disposition needs no RFC 5987 encoding', () => {
    expect(/^[\x20-\x7e]+$/.test(usersExportFilename('pdf', NOW))).toBe(true);
  });
});

describe('usersExportSubtitle', () => {
  it('says "todos" for both axes when nothing is filtered', () => {
    const subtitle = usersExportSubtitle({
      count: 12,
      kind: undefined,
      status: undefined,
      truncated: false,
      now: NOW,
    });
    expect(subtitle).toContain('12 usuarios');
    expect(subtitle).toContain('Tipo: todos');
    expect(subtitle).toContain('Estado: todos');
    expect(subtitle).toContain('Generado el 14/08/2026');
  });

  it('names the active filters so a partial list cannot be mistaken for all of them', () => {
    const subtitle = usersExportSubtitle({
      count: 3,
      kind: 'wholesale',
      status: 'disabled',
      truncated: false,
      now: NOW,
    });
    expect(subtitle).toContain('Tipo: Wholesale');
    expect(subtitle).toContain('Estado: Desactivados');
  });

  it('agrees in number for a single user', () => {
    const subtitle = usersExportSubtitle({
      count: 1,
      kind: undefined,
      status: undefined,
      truncated: false,
      now: NOW,
    });
    expect(subtitle).toContain('1 usuario ');
  });

  it('flags a truncated export instead of presenting it as complete', () => {
    const subtitle = usersExportSubtitle({
      count: 5000,
      kind: undefined,
      status: undefined,
      truncated: true,
      now: NOW,
    });
    expect(subtitle).toContain('Primeros 5000 usuarios (export limitado)');
  });
});
