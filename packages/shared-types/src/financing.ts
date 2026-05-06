export interface InstallmentArgs {
  priceUsd: number;
  termMonths: number;
  annualInterestRate: number; // 0.18 = 18%
  downPaymentPercent: number; // 0.2 = 20%
}

export interface InstallmentResult {
  downPayment: number;
  principal: number;
  monthly: number;
  totalToPay: number;
  totalInterest: number;
}

/**
 * Standard French amortization (equal monthly installments).
 * Returns 0 for invalid inputs (negative numbers, term <= 0) so the UI
 * can render gracefully without throwing.
 */
export function calculateInstallment(args: InstallmentArgs): InstallmentResult {
  const { priceUsd, termMonths, annualInterestRate, downPaymentPercent } = args;
  if (
    priceUsd <= 0 ||
    termMonths <= 0 ||
    annualInterestRate < 0 ||
    downPaymentPercent < 0 ||
    downPaymentPercent >= 1
  ) {
    return { downPayment: 0, principal: 0, monthly: 0, totalToPay: 0, totalInterest: 0 };
  }
  const downPayment = round2(priceUsd * downPaymentPercent);
  const principal = round2(priceUsd - downPayment);

  let monthly: number;
  if (annualInterestRate === 0) {
    monthly = principal / termMonths;
  } else {
    const r = annualInterestRate / 12;
    monthly = (principal * r) / (1 - Math.pow(1 + r, -termMonths));
  }
  monthly = round2(monthly);
  const totalToPay = round2(monthly * termMonths + downPayment);
  const totalInterest = round2(totalToPay - priceUsd);
  return { downPayment, principal, monthly, totalToPay, totalInterest };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
