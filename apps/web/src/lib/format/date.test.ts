import { describe, it, expect } from 'vitest';
import { formatDateTimePy } from './date';

describe('formatDateTimePy', () => {
  // 2026-09-26 16:23:38 UTC = 13:23 en Paraguay (UTC-3 todo el año).
  const T = Date.UTC(2026, 8, 26, 16, 23, 38);

  it('muestra la hora de Paraguay, no la del servidor', () => {
    expect(formatDateTimePy('es', T)).toBe('26/09/2026 13:23');
  });

  it('sin segundos', () => {
    expect(formatDateTimePy('es', T)).not.toMatch(/:\d{2}:\d{2}/);
  });

  it('pasa la medianoche UTC sin cambiar de día antes de tiempo', () => {
    // 02:30 UTC del 27 = 23:30 del 26 en Paraguay.
    expect(formatDateTimePy('es', Date.UTC(2026, 8, 27, 2, 30))).toBe('26/09/2026 23:30');
  });

  it('medianoche con 00, no 24', () => {
    expect(formatDateTimePy('es', Date.UTC(2026, 8, 27, 3, 0))).toBe('27/09/2026 00:00');
  });

  it('igual en es y en', () => {
    expect(formatDateTimePy('en', T)).toBe(formatDateTimePy('es', T));
  });

  it('fecha inválida', () => {
    expect(formatDateTimePy('es', Number.NaN)).toBe('—');
  });
});
