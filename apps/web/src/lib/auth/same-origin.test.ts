import { describe, it, expect } from 'vitest';
import { sameOrigin } from './same-origin';

const req = (h: Record<string, string>) => ({ headers: new Headers(h) });

describe('sameOrigin', () => {
  it('acepta el mismo host', () => {
    expect(
      sameOrigin(req({ origin: 'https://renewsubastas.com.py', host: 'renewsubastas.com.py' })),
    ).toBe(true);
  });

  it('rechaza otro host', () => {
    expect(sameOrigin(req({ origin: 'https://evil.example', host: 'renewsubastas.com.py' }))).toBe(
      false,
    );
  });

  it('rechaza sin Origin cuando el navegador dice cross-site', () => {
    expect(sameOrigin(req({ host: 'renewsubastas.com.py', 'sec-fetch-site': 'cross-site' }))).toBe(
      false,
    );
  });

  it('acepta sin Origin ni Sec-Fetch-Site (llamada de servidor)', () => {
    expect(sameOrigin(req({ host: 'renewsubastas.com.py' }))).toBe(true);
  });

  it('rechaza un Origin malformado', () => {
    expect(sameOrigin(req({ origin: 'no es una url', host: 'renewsubastas.com.py' }))).toBe(false);
  });
});
