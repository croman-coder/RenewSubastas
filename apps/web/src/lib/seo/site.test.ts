import { describe, expect, it } from 'vitest';
import { indexRobots, authPageMetadata } from './site';

describe('indexRobots', () => {
  it('lets search engines index the Spanish site', () => {
    expect(indexRobots('es')).toBeUndefined();
  });

  it('keeps the English copy out of the index while it is untranslated', () => {
    expect(indexRobots('en')).toEqual({ index: false, follow: true });
  });
});

describe('authPageMetadata', () => {
  it('gives the login page its own title and keeps it out of the index', () => {
    const m = authPageMetadata('es', 'login');
    expect(m.title).toBe('Iniciar sesión · Renew Subastas');
    expect(m.robots).toEqual({ index: false, follow: true });
  });

  it('does the same for registration, in the page language', () => {
    const m = authPageMetadata('en', 'register');
    expect(m.title).toBe('Create account · Renew Subastas');
    expect(m.robots).toEqual({ index: false, follow: true });
  });
});
