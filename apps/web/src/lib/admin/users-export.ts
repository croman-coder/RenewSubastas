import type { UserListItem } from './list-users';
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
 */
export const USERS_EXPORT_COLUMNS = [
  { header: 'Nombre', xlsxWidth: 34, pdfWidth: 200 },
  { header: 'Email', xlsxWidth: 42, pdfWidth: 299 },
] as const;

/**
 * One row per user, in the same order the table shows them (newest first).
 * `firstName`/`lastName` default to '' in the loader, so a profile missing
 * both yields an empty name cell rather than the string "undefined".
 */
export function userExportRows(items: UserListItem[]): string[][] {
  return items.map((user) => [`${user.firstName} ${user.lastName}`.trim(), user.email]);
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
 * the "Nombre | Email" header for the file to be usable as data.
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
