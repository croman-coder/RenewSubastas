import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { OrganizationJsonLd } from './organization-json-ld';
import type { Company } from '@/lib/legal/load-company';

const EMPTY: Company = { legalName: '', ruc: '', address: '', email: '', phone: '' };

function dealer(company: Company): Record<string, unknown> {
  const html = renderToStaticMarkup(<OrganizationJsonLd locale="es" company={company} />);
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map(
    (m) => JSON.parse(m[1]!) as Record<string, unknown>,
  );
  const found = blocks.find((b) => b['@type'] === 'AutoDealer');
  if (!found) throw new Error('no AutoDealer block');
  return found;
}

describe('OrganizationJsonLd', () => {
  it('always identifies the brand with its logo', () => {
    const d = dealer(EMPTY);
    expect(d['logo']).toBe('https://renewsubastas.com.py/icon.png');
    expect(d['image']).toBe('https://renewsubastas.com.py/icon.png');
  });

  it('links the brand profiles on Instagram and Facebook', () => {
    expect(dealer(EMPTY)['sameAs']).toEqual([
      'https://www.instagram.com/renewpy.sr',
      'https://www.facebook.com/renewpy.sr',
    ]);
  });

  it('puts the configured phone at the top level, where local results read it', () => {
    const d = dealer({ ...EMPTY, phone: '+595 21 000 000' });
    expect(d['telephone']).toBe('+595 21 000 000');
  });

  it('asserts no phone or address that nobody configured', () => {
    const d = dealer(EMPTY);
    expect(d).not.toHaveProperty('telephone');
    expect(d).not.toHaveProperty('address');
  });
});
