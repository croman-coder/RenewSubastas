'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  PHONE_COUNTRIES,
  findCountryByIso2,
  splitStoredPhone,
  type PhoneCountry,
} from '@/lib/geo/phone-countries';

interface Props {
  /** Stored E.164-ish value, e.g. "+595981123456". */
  value: string;
  onChange: (next: string) => void;
  id?: string;
  disabled?: boolean;
  /**
   * When true, the country selector is hidden and the prefix is locked to
   * Paraguay. Useful for deployments aimed exclusively at the local market.
   */
  paraguayOnly?: boolean;
}

/**
 * Phone input with a country selector that locks the dial prefix.
 *
 * - Selector renders flag + country name + dial prefix.
 * - The user only types the local digits (no need to remember +595).
 * - Max length is enforced per-country (Paraguay = 9, others = country max).
 * - On blur / change, we emit the full international form back through
 *   onChange so the consumer can persist a single canonical value.
 */
export function PhoneInput({ value, onChange, id, disabled, paraguayOnly }: Props) {
  // Initial split — default to PY when there's no stored value or no known
  // country prefix.
  const [country, setCountry] = useState<PhoneCountry>(() => splitStoredPhone(value).country);
  const [national, setNational] = useState<string>(() => splitStoredPhone(value).national);

  // Re-sync if the parent value changes from the outside (e.g. form reset).
  // We intentionally only depend on `value` so internal edits through the
  // local setters don't bounce off the parent and back.
  useEffect(() => {
    const split = splitStoredPhone(value);
    setCountry(split.country);
    setNational(split.national);
  }, [value]);

  function emit(nextCountry: PhoneCountry, nextNational: string) {
    if (!nextNational) {
      onChange('');
      return;
    }
    onChange(`+${nextCountry.dial}${nextNational}`);
  }

  function handleCountry(iso2: string) {
    const next = findCountryByIso2(iso2);
    if (!next) return;
    setCountry(next);
    // If the user already has more digits than the new country allows, trim.
    const trimmed = national.slice(0, next.max);
    setNational(trimmed);
    emit(next, trimmed);
  }

  function handleNational(raw: string) {
    // Strip everything that isn't a digit to keep the input numeric
    // regardless of the user's keyboard / paste source.
    const digits = raw.replace(/\D/g, '').slice(0, country.max);
    setNational(digits);
    emit(country, digits);
  }

  return (
    <div className="flex gap-2">
      {!paraguayOnly && (
        <Select
          value={country.iso2}
          onValueChange={handleCountry}
          {...(disabled !== undefined ? { disabled } : {})}
        >
          <SelectTrigger className="w-[150px] shrink-0 num-tab" aria-label="País">
            <SelectValue>
              <span className="flex items-center gap-1.5">
                <span className="text-lg leading-none">{country.flag}</span>
                <span className="text-text-strong">+{country.dial}</span>
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {PHONE_COUNTRIES.map((c) => (
              <SelectItem key={c.iso2} value={c.iso2} className="num-tab">
                <span className="flex items-center gap-2">
                  <span className="text-base leading-none">{c.flag}</span>
                  <span className="flex-1">{c.name}</span>
                  <span className="text-text-muted">+{c.dial}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {paraguayOnly && (
        <div className="inline-flex items-center gap-1.5 rounded-md border border-text-subtle/15 bg-bg-deep/40 px-3 text-sm text-text-muted shrink-0 num-tab select-none">
          <span className="text-base leading-none">🇵🇾</span>+595
        </div>
      )}
      <Input
        id={id}
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        disabled={disabled}
        placeholder={country.iso2 === 'PY' ? '981 123 456' : `${country.max} dígitos sin prefijo`}
        value={national}
        onChange={(e) => handleNational(e.target.value)}
        maxLength={country.max}
        className="num-tab"
      />
    </div>
  );
}
