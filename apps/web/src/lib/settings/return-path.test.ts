import { describe, it, expect } from 'vitest';
import { safeAuctionReturnPath } from './return-path';

describe('safeAuctionReturnPath', () => {
  it('acepta la ruta de una subasta del mismo idioma', () => {
    expect(safeAuctionReturnPath('/es/auctions/abc123', 'es')).toBe('/es/auctions/abc123');
  });

  it('rechaza otro idioma, otra sección y valores vacíos', () => {
    expect(safeAuctionReturnPath('/en/auctions/abc123', 'es')).toBeNull();
    expect(safeAuctionReturnPath('/es/admin/users', 'es')).toBeNull();
    expect(safeAuctionReturnPath('', 'es')).toBeNull();
    expect(safeAuctionReturnPath(undefined, 'es')).toBeNull();
  });

  it('rechaza URLs absolutas, protocolo relativo y esquemas', () => {
    expect(safeAuctionReturnPath('https://evil.com/es/auctions/a', 'es')).toBeNull();
    expect(safeAuctionReturnPath('//evil.com/es/auctions/a', 'es')).toBeNull();
    expect(safeAuctionReturnPath('javascript:alert(1)', 'es')).toBeNull();
  });

  it('rechaza subrutas, query, fragmento y recorridos de directorio', () => {
    expect(safeAuctionReturnPath('/es/auctions/a/../../admin', 'es')).toBeNull();
    expect(safeAuctionReturnPath('/es/auctions/a?x=1', 'es')).toBeNull();
    expect(safeAuctionReturnPath('/es/auctions/a#x', 'es')).toBeNull();
    expect(safeAuctionReturnPath('/es/auctions/a\\b', 'es')).toBeNull();
    expect(safeAuctionReturnPath('/es/auctions/', 'es')).toBeNull();
  });
});
