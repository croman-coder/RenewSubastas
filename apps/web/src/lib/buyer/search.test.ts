import { describe, expect, it } from 'vitest';
import { matchesSearch } from './search';

const hilux = { make: 'Toyota', model: 'Hilux', year: 2019 };
const c3 = { make: 'Citroën', model: 'C3 Aircross', year: 2021 };

describe('matchesSearch', () => {
  it('shows everything for an empty or blank query', () => {
    expect(matchesSearch(hilux, '')).toBe(true);
    expect(matchesSearch(hilux, '   ')).toBe(true);
  });
  it('matches make, model or year, ignoring case', () => {
    expect(matchesSearch(hilux, 'hilux')).toBe(true);
    expect(matchesSearch(hilux, 'TOYOTA')).toBe(true);
    expect(matchesSearch(hilux, '2019')).toBe(true);
  });
  it('ignores accents on both sides', () => {
    expect(matchesSearch(c3, 'citroen')).toBe(true);
    expect(matchesSearch({ ...c3, make: 'Citroen' }, 'citroën')).toBe(true);
  });
  it('needs every word, in any order', () => {
    expect(matchesSearch(hilux, '2019 hilux')).toBe(true);
    expect(matchesSearch(hilux, 'hilux 2020')).toBe(false);
  });
  it('matches partial words while typing', () => {
    expect(matchesSearch(hilux, 'hil')).toBe(true);
    expect(matchesSearch(hilux, '201')).toBe(true);
  });
  it('rejects what is not there', () => {
    expect(matchesSearch(hilux, 'ford')).toBe(false);
  });
});
