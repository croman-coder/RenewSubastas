import { describe, expect, it } from 'vitest';
import { formatClock, formatCountdown, remainingLabel } from './remaining';

const MIN = 60_000;
const H = 3_600_000;
const D = 86_400_000;

describe('formatClock', () => {
  it('pads hours, minutes and seconds', () => {
    expect(formatClock(H + MIN + 1000)).toBe('01:01:01');
  });
  it('keeps counting hours past a day, for the big home clock', () => {
    expect(formatClock(26 * H)).toBe('26:00:00');
  });
  it('floors partial seconds and never goes negative', () => {
    expect(formatClock(1999)).toBe('00:00:01');
    expect(formatClock(0)).toBe('00:00:00');
    expect(formatClock(-5000)).toBe('00:00:00');
  });
});

describe('formatCountdown', () => {
  it('matches the catalog card: HH:MM:SS under a day', () => {
    expect(formatCountdown(H + MIN + 1000)).toBe('01:01:01');
  });
  it('switches to days and drops seconds from a day on', () => {
    expect(formatCountdown(D + H + MIN + 1000)).toBe('1d 01:01');
  });
  it('shows zeros once closed', () => {
    expect(formatCountdown(-1)).toBe('00:00:00');
  });
});

describe('remainingLabel', () => {
  it('handles closed and under a minute', () => {
    expect(remainingLabel(0)).toBe('0 min');
    expect(remainingLabel(30_000)).toBe('menos de 1 min');
  });
  it('uses minutes under an hour', () => {
    expect(remainingLabel(45 * MIN)).toBe('45 min');
  });
  it('uses hours and minutes, dropping zero minutes', () => {
    expect(remainingLabel(3 * H)).toBe('3 h');
    expect(remainingLabel(3 * H + 20 * MIN + 59_000)).toBe('3 h 20 min');
  });
  it('uses days and hours from a day on, dropping zero hours', () => {
    expect(remainingLabel(2 * D)).toBe('2 d');
    expect(remainingLabel(2 * D + 4 * H + 30 * MIN)).toBe('2 d 4 h');
  });
});
