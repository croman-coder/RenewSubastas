/**
 * Alt text for a vehicle photo: "Toyota Hilux 2019".
 *
 * The catalog cards shipped alt="" (decorative), so search engines had
 * nothing to index for 19 photos on the landing and a screen reader skipped
 * the one image that says which car it is (auditoría SEO, 2026-09-26).
 * Missing parts are dropped rather than printed as blanks or a zero year.
 */
export function vehicleAlt(make: string, model: string, year: number): string {
  const parts = [make.trim(), model.trim(), year > 0 ? String(year) : ''].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'Vehículo en subasta';
}
