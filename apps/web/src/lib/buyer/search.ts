/**
 * Búsqueda del catálogo en el celular (spec 2026-09-27 §5.3): filtra la lista
 * que ya llegó del servidor, sin consulta nueva. Sin tildes ni mayúsculas
 * porque en el teléfono nadie escribe "Citroën"; cada palabra tiene que
 * aparecer en marca, modelo o año, en cualquier orden.
 */
export interface Searchable {
  make: string;
  model: string;
  year: number;
}

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function matchesSearch(item: Searchable, query: string): boolean {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalize(`${item.make} ${item.model} ${item.year}`);
  return words.every((w) => haystack.includes(w));
}
