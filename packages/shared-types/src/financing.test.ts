import { describe, it, expect } from 'vitest';
import { calculateInstallment } from './financing';

describe('calculateInstallment', () => {
  it('returns zeros for invalid inputs', () => {
    expect(
      calculateInstallment({
        priceUsd: 0,
        termMonths: 12,
        annualInterestRate: 0.1,
        downPaymentPercent: 0.2,
      }),
    ).toEqual({ downPayment: 0, principal: 0, monthly: 0, totalToPay: 0, totalInterest: 0 });
    expect(
      calculateInstallment({
        priceUsd: 10000,
        termMonths: 0,
        annualInterestRate: 0.1,
        downPaymentPercent: 0.2,
      }).monthly,
    ).toBe(0);
    expect(
      calculateInstallment({
        priceUsd: 10000,
        termMonths: 12,
        annualInterestRate: -0.1,
        downPaymentPercent: 0.2,
      }).monthly,
    ).toBe(0);
    expect(
      calculateInstallment({
        priceUsd: 10000,
        termMonths: 12,
        annualInterestRate: 0.1,
        downPaymentPercent: 1.5,
      }).monthly,
    ).toBe(0);
  });

  it('zero interest splits principal evenly across term', () => {
    const r = calculateInstallment({
      priceUsd: 12000,
      termMonths: 12,
      annualInterestRate: 0,
      downPaymentPercent: 0,
    });
    expect(r.downPayment).toBe(0);
    expect(r.principal).toBe(12000);
    expect(r.monthly).toBe(1000);
    expect(r.totalToPay).toBe(12000);
    expect(r.totalInterest).toBe(0);
  });

  it('20% down + zero interest', () => {
    const r = calculateInstallment({
      priceUsd: 10000,
      termMonths: 10,
      annualInterestRate: 0,
      downPaymentPercent: 0.2,
    });
    expect(r.downPayment).toBe(2000);
    expect(r.principal).toBe(8000);
    expect(r.monthly).toBe(800);
    expect(r.totalToPay).toBe(10000);
  });

  it('matches French-amortization formula at 12% annual / 12 months', () => {
    // principal=10000, r=0.01, n=12 → monthly = 10000*0.01/(1-1.01^-12) = 888.49
    const r = calculateInstallment({
      priceUsd: 10000,
      termMonths: 12,
      annualInterestRate: 0.12,
      downPaymentPercent: 0,
    });
    expect(r.monthly).toBeCloseTo(888.49, 1);
    // total interest ~ 661.85
    expect(r.totalInterest).toBeGreaterThan(600);
    expect(r.totalInterest).toBeLessThan(700);
  });

  it('higher term → lower monthly, higher total interest', () => {
    const short = calculateInstallment({
      priceUsd: 20000,
      termMonths: 12,
      annualInterestRate: 0.18,
      downPaymentPercent: 0.2,
    });
    const long = calculateInstallment({
      priceUsd: 20000,
      termMonths: 60,
      annualInterestRate: 0.18,
      downPaymentPercent: 0.2,
    });
    expect(long.monthly).toBeLessThan(short.monthly);
    expect(long.totalInterest).toBeGreaterThan(short.totalInterest);
  });

  it('keeps results stable to 2 decimals', () => {
    const r = calculateInstallment({
      priceUsd: 15000,
      termMonths: 36,
      annualInterestRate: 0.15,
      downPaymentPercent: 0.25,
    });
    // sanity-check the rounding pattern
    expect(Number.isFinite(r.monthly)).toBe(true);
    expect(r.monthly).toBe(Math.round(r.monthly * 100) / 100);
  });
});
