export interface RelistCandidate {
  id: string;
  status: string;
  audience?: string;
  endsAtMs: number;
}

/**
 * A qué subasta lleva el enlace viejo de una subasta sin vender o cancelada: a
 * la minorista abierta del mismo vehículo (spec §6). En vivo le gana a
 * programada; entre iguales, la que cierra primero. Una mayorista nunca es
 * destino, porque el enlace es público.
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
