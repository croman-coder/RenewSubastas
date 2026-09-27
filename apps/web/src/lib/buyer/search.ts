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

// U+0300 a U+036F: marcas diacríticas combinantes que deja `normalize('NFD')`
// (tildes, diéresis, etc.). Antes esto era un regex con los caracteres
// combinantes literales (invisibles) escritos directo en el código: mismo
// comportamiento, pero ilegible e imposible de diffear a simple vista. Un
// regex o string con esos mismos caracteres escapados tampoco sirve:
// Prettier (corre en el pre-commit) los reimprime como caracter crudo de
// vuelta apenas guarda, así que el rango va como números.
const COMBINING_MARK_START = 0x0300;
const COMBINING_MARK_END = 0x036f;

function normalize(s: string): string {
  return Array.from(s.normalize('NFD'))
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code < COMBINING_MARK_START || code > COMBINING_MARK_END;
    })
    .join('')
    .toLowerCase();
}

export function matchesSearch(item: Searchable, query: string): boolean {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalize(`${item.make} ${item.model} ${item.year}`);
  return words.every((w) => haystack.includes(w));
}
