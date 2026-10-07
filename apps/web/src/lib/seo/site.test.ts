import { describe, expect, it } from 'vitest';
import { indexRobots, authPageMetadata, canonicalUrl, SITE_URL } from './site';

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

describe('canonicalUrl', () => {
  it('arma la URL absoluta con el idioma y sin barra final', () => {
    expect(canonicalUrl('es', '/terminos')).toBe(`${SITE_URL}/es/terminos`);
    expect(canonicalUrl('es')).toBe(`${SITE_URL}/es`);
  });

  it('login y registro apuntan a su URL limpia (sin ?from=) para no contar cada subasta como un duplicado', () => {
    expect(authPageMetadata('es', 'login').alternates?.canonical).toBe(`${SITE_URL}/es/login`);
    expect(authPageMetadata('en', 'register').alternates?.canonical).toBe(
      `${SITE_URL}/en/register`,
    );
  });
});
