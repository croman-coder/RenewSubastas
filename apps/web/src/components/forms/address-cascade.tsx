'use client';

import { useMemo } from 'react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PARAGUAY_DEPARTMENTS, getBarriosFor, getCitiesFor } from '@/lib/geo/paraguay';

export interface AddressCascadeValue {
  department: string;
  city: string;
  barrio: string;
}

interface Props {
  value: AddressCascadeValue;
  onChange: (next: AddressCascadeValue) => void;
  disabled?: boolean;
}

/**
 * Three cascading dropdowns — Department → City → Barrio — that filter each
 * level based on the previous selection. When a level above changes, the
 * selections below it are cleared so the user can't end up with a barrio
 * from the wrong city.
 *
 * If the dataset doesn't have barrios for a given (department, city) combo,
 * the third dropdown is hidden entirely instead of showing an empty list.
 */
export function AddressCascade({ value, onChange, disabled }: Props) {
  const departments = PARAGUAY_DEPARTMENTS;
  const cities = useMemo(() => getCitiesFor(value.department), [value.department]);
  const barrios = useMemo(
    () => getBarriosFor(value.department, value.city),
    [value.department, value.city],
  );

  function setDepartment(department: string) {
    onChange({ department, city: '', barrio: '' });
  }
  function setCity(city: string) {
    onChange({ ...value, city, barrio: '' });
  }
  function setBarrio(barrio: string) {
    onChange({ ...value, barrio });
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="space-y-2">
        <Label htmlFor="address-department">Departamento</Label>
        <Select
          value={value.department}
          onValueChange={setDepartment}
          {...(disabled !== undefined ? { disabled } : {})}
        >
          <SelectTrigger id="address-department">
            <SelectValue placeholder="Elegí un departamento" />
          </SelectTrigger>
          <SelectContent>
            {departments.map((d) => (
              <SelectItem key={d.name} value={d.name}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="address-city">Ciudad</Label>
        <Select
          value={value.city}
          onValueChange={setCity}
          disabled={!!disabled || !value.department}
        >
          <SelectTrigger id="address-city">
            <SelectValue
              placeholder={value.department ? 'Elegí una ciudad' : 'Elegí departamento primero'}
            />
          </SelectTrigger>
          <SelectContent>
            {cities.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="address-barrio">Barrio</Label>
        <Select
          value={value.barrio}
          onValueChange={setBarrio}
          disabled={!!disabled || !value.city || barrios.length === 0}
        >
          <SelectTrigger id="address-barrio">
            <SelectValue
              placeholder={
                !value.city
                  ? 'Elegí ciudad primero'
                  : barrios.length === 0
                    ? 'Sin barrios cargados'
                    : 'Elegí un barrio'
              }
            />
          </SelectTrigger>
          <SelectContent>
            {barrios.map((b) => (
              <SelectItem key={b} value={b}>
                {b}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
