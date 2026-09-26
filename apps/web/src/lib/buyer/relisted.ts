export interface RelistCandidate {
  id: string;
  status: string;
  audience?: string;
  endsAtMs: number;
}

/**
 * La subasta minorista abierta del mismo vehículo que un enlace viejo, sin vender,
 * debe llevar a (spec §6). Vivo le gana a programado; entre iguales, el que cierra primero.
 * Mayorista nunca es destino: el enlace es público.
 */
export function pickRelistedAuction(
  candidates: RelistCandidate[],
  currentId: string,
): string | null {
  const open = candidates.filter(
    (c) =>
      c.id !== currentId &&
      (c.audience ?? 'retail') === 'retail' &&
      (c.status === 'live' || c.status === 'scheduled'),
  );
  open.sort((x, y) =>
    x.status === y.status ? x.endsAtMs - y.endsAtMs : x.status === 'live' ? -1 : 1,
  );
  return open[0]?.id ?? null;
}
