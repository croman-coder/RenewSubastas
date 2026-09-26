/**
 * Clave de traducción (bajo `staff.vehicles.form`) de cada valor de los enums
 * del vehículo. Es la misma copia que usa el formulario de carga, así que el
 * comprador ve exactamente lo que eligió el staff.
 *
 * Existe porque la ficha del comprador mostraba el valor crudo guardado en
 * Firestore —"automatic", "electric", "used"— en una pantalla en español.
 *
 * Devuelve `null` para un valor desconocido (datos viejos o cargados a mano);
 * quien llama muestra el valor tal cual antes que inventar una etiqueta.
 */
const KEYS = {
  transmission: {
    manual: 'transmissionManual',
    automatic: 'transmissionAutomatic',
    cvt: 'transmissionCvt',
  },
  fuelType: {
    gasoline: 'fuelGasoline',
    diesel: 'fuelDiesel',
    hybrid: 'fuelHybrid',
    electric: 'fuelElectric',
  },
  condition: {
    new: 'conditionNew',
    used: 'conditionUsed',
    damaged: 'conditionDamaged',
  },
} as const;

export type VehicleEnumField = keyof typeof KEYS;

export function vehicleEnumLabelKey(field: VehicleEnumField, value: string): string | null {
  return (KEYS[field] as Record<string, string>)[value] ?? null;
}
