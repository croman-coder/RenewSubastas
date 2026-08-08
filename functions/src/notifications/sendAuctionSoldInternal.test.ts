import { describe, it, expect } from 'vitest';
import { buildInternalSoldEmail } from './sendAuctionSoldInternal.js';

describe('buildInternalSoldEmail', () => {
  const base = {
    vanity: 'RNW-ABC123',
    vehName: 'Toyota Hilux 2021',
    finalPrice: 34000,
    depositUsd: 3400,
    deadlineText: '9 de agosto, 18:00',
    buyerName: 'Juan Pérez',
    buyerEmail: 'juan@example.com',
    buyerPhone: '+595971000111',
    buyerDoc: 'CI 1234567',
    viaBuyNow: true,
  };

  it('etiqueta la compra directa', () => {
    const { subject, html } = buildInternalSoldEmail(base);
    expect(subject).toContain('Compra ya');
    expect(html).toContain('Compra ya');
  });

  it('etiqueta la subasta ganada', () => {
    const { subject, html } = buildInternalSoldEmail({ ...base, viaBuyNow: false });
    expect(subject).toContain('Subasta ganada');
    expect(html).toContain('Subasta ganada');
  });

  it('escapa el nombre del comprador', () => {
    const { html } = buildInternalSoldEmail({
      ...base,
      buyerName: '<img src=x onerror=alert(1)>',
    });
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('incluye seña y plazo, que es lo que administración necesita', () => {
    const { html } = buildInternalSoldEmail(base);
    expect(html).toContain('3.400');
    expect(html).toContain('9 de agosto, 18:00');
  });

  it('escapa el nombre del vehículo', () => {
    const { html } = buildInternalSoldEmail({
      ...base,
      vehName: '<img src=x onerror=alert(1)>',
    });
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});
