import type { UserListItem } from './list-users';
import { formatDateOnlyPy } from '@/lib/format/date';
import { formatDocument, phoneDigits } from './contact-links';
import type { UsersKind, UsersStatus } from './users-filter';

/**
 * Shape of the `/admin/users` export, shared by both output formats so the
 * spreadsheet and the PDF can never drift apart.
 *
 * Everything here is deliberately Spanish-only. The admin console is
 * Spanish-first (the account-type filter hardcodes "Compradores (todos)",
 * "Retail", "Wholesale"), and these files are internal operating artifacts —
 * localising them would mean threading a locale through the download URL for
 * no operator that exists today.
 */

export type UsersExportFormat = 'xlsx' | 'pdf';

/**
 * The exported columns. Widths differ by format because the units do:
 * Excel counts characters, PDF counts points. The PDF widths sum to the A4
 * content width (595 - 2 * 48 margin = 499pt).
 *
 * PDF text is cut by an estimate of 5.5pt per character (10pt body) minus a
 * 10pt gutter: Teléfono (84) fits "+595981123456", Documento (88) fits
 * "RUC 80012345-6" and Alta (66) fits "09/10/2025" (date only, no time, so the
 * freed width goes to Email: 157pt fits ~26 characters). Nombre and Email may
 * still end in "…" on very long values; the spreadsheet always carries the
 * full text.
 */
export const USERS_EXPORT_COLUMNS = [
  { header: 'Nombre', xlsxWidth: 28, pdfWidth: 104 },
  { header: 'Email', xlsxWidth: 36, pdfWidth: 157 },
  { header: 'Teléfono', xlsxWidth: 18, pdfWidth: 84 },
  { header: 'Documento', xlsxWidth: 18, pdfWidth: 88 },
  { header: 'Alta', xlsxWidth: 12, pdfWidth: 66 },
] as const;

/**
 * One row per user, in the same order the table shows them (newest first).
 * `firstName`/`lastName` default to '' in the loader, so a profile missing
 * both yields an empty name cell rather than the string "undefined".
 */
export function userExportRows(items: UserListItem[]): string[][] {
  return items.map((user) => [
    `${user.firstName} ${user.lastName}`.trim(),
    user.email,
    exportPhone(user.phone),
    formatDocument(user.documentNumber ? user.documentType : undefined, user.documentNumber) ?? '',
    // createdAt 0 = el usuario no tiene fecha de alta (ver toUserListItem).
    user.createdAt ? formatDateOnlyPy('es', user.createdAt) : '',
  ]);
}

/**
 * Teléfono listo para marcar: "+595981123456". Lo que no se puede normalizar
 * (menos de 8 dígitos) se exporta tal cual, para que el equipo vea el dato
 * mal cargado y lo corrija en vez de que desaparezca del archivo.
 */
function exportPhone(raw: string): string {
  const digits = phoneDigits(raw);
  return digits ? `+${digits}` : raw.trim();
}

export function usersExportFilename(format: UsersExportFormat, now: Date): string {
  return `usuarios-${isoDate(now)}.${format}`;
}

const KIND_LABELS: Record<UsersKind, string> = {
  admin: 'Admin',
  staff: 'Staff',
  finanzas: 'Finanzas',
  buyer: 'Compradores',
  retail: 'Retail',
  wholesale: 'Wholesale',
};

const STATUS_LABELS: Record<UsersStatus, string> = {
  active: 'Activos',
  disabled: 'Desactivados',
};

/**
 * Context line printed under the PDF title. It names the filters that produced
 * the file, because a PDF of 40 users out of 500 with nothing explaining why
 * is the kind of artifact that gets forwarded and misread.
 *
 * The spreadsheet gets no equivalent line on purpose: row 1 there has to stay
 * the column header for the file to be usable as data.
 */
export function usersExportSubtitle(options: {
  count: number;
  kind: UsersKind | undefined;
  status: UsersStatus | undefined;
  truncated: boolean;
  now: Date;
}): string {
  const parts: string[] = [
    options.truncated
      ? `Primeros ${options.count} usuarios (export limitado)`
      : `${options.count} ${options.count === 1 ? 'usuario' : 'usuarios'}`,
  ];
  parts.push(options.kind ? `Tipo: ${KIND_LABELS[options.kind]}` : 'Tipo: todos');
  parts.push(options.status ? `Estado: ${STATUS_LABELS[options.status]}` : 'Estado: todos');
  parts.push(`Generado el ${displayDate(options.now)}`);
  return parts.join('  ·  ');
}

// Both helpers read UTC parts rather than local ones: the server that renders
// the export runs in UTC while operators are at UTC-3, so anything derived
// from the host's local time would be inconsistent between environments. The
// worst case is a late-evening export dated a few hours ahead.
function isoDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function displayDate(now: Date): string {
  const iso = isoDate(now);
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}
