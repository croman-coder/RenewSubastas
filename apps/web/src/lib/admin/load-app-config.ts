import 'server-only';
import { cache } from 'react';
import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore } from 'firebase-admin/firestore';

export interface AppConfigSnapshot {
  currency: { primary: 'USD' | 'PYG'; showSecondary: boolean; pygPerUsd: number | null };
  bid: { fixedIncrementUsd: number; allowManualIncrement: boolean; antiSnipingSeconds: number };
  financing: {
    enabled: boolean;
    allowedTerms: number[];
    annualInterestRate: number;
    downPaymentPercent: number;
    minFinanceableUsd: number;
    notesEs: string;
    notesEn: string;
  };
  emails: { adminStaffDomain: string; fromAddress: string; fromName: string };
  payment: {
    bankAccountHolder: string;
    bankName: string;
    bankAccountType: string;
    bankAccountNumber: string;
    bankRuc: string;
    bankNamePyg: string;
    bankAccountNumberPyg: string;
    bankAccountTypePyg: string;
    depositPercent: number;
    deadlineHours: number;
    instructionsEs: string;
    instructionsEn: string;
    contactEmail: string;
    contactPhone: string;
  };
}

const DEFAULTS: AppConfigSnapshot = {
  currency: { primary: 'USD', showSecondary: false, pygPerUsd: null },
  bid: { fixedIncrementUsd: 500, allowManualIncrement: true, antiSnipingSeconds: 60 },
  financing: {
    enabled: false,
    allowedTerms: [12, 24, 36, 48, 60],
    annualInterestRate: 0,
    downPaymentPercent: 0.2,
    minFinanceableUsd: 0,
    notesEs: '',
    notesEn: '',
  },
  emails: {
    adminStaffDomain: 'santarosa.com.py',
    fromAddress: 'no-reply@santarosa.com.py',
    fromName: 'Renew Subastas',
  },
  payment: {
    bankAccountHolder: '',
    bankName: '',
    bankAccountType: '',
    bankAccountNumber: '',
    bankRuc: '',
    bankNamePyg: '',
    bankAccountNumberPyg: '',
    bankAccountTypePyg: '',
    depositPercent: 0.1,
    deadlineHours: 24,
    instructionsEs: '',
    instructionsEn: '',
    contactEmail: '',
    contactPhone: '',
  },
};

/**
 * Per-request cache so layout + page + nested components share the same
 * Firestore read on app_config/global. Configuration is small enough that
 * holding it in memory for the duration of one render is essentially free.
 */
export const loadAppConfigSnapshot = cache(async (): Promise<AppConfigSnapshot> => {
  const snap = await getFirestore(getAdminApp()).doc('app_config/global').get();
  if (!snap.exists) return DEFAULTS;
  const data = snap.data() ?? {};
  const c = (data['currency'] ?? {}) as Record<string, unknown>;
  const b = (data['bid'] ?? {}) as Record<string, unknown>;
  const f = (data['financing'] ?? {}) as Record<string, unknown>;
  const e = (data['emails'] ?? {}) as Record<string, unknown>;
  const p = (data['payment'] ?? {}) as Record<string, unknown>;
  const fNotes = (f['notes'] ?? {}) as Record<string, unknown>;
  return {
    currency: {
      primary: (c['primary'] as 'USD' | 'PYG') ?? DEFAULTS.currency.primary,
      showSecondary: (c['showSecondary'] as boolean) ?? DEFAULTS.currency.showSecondary,
      pygPerUsd: (c['pygPerUsd'] as number | null) ?? DEFAULTS.currency.pygPerUsd,
    },
    bid: {
      fixedIncrementUsd: (b['fixedIncrementUsd'] as number) ?? DEFAULTS.bid.fixedIncrementUsd,
      allowManualIncrement:
        (b['allowManualIncrement'] as boolean) ?? DEFAULTS.bid.allowManualIncrement,
      antiSnipingSeconds: (b['antiSnipingSeconds'] as number) ?? DEFAULTS.bid.antiSnipingSeconds,
    },
    financing: {
      enabled: (f['enabled'] as boolean) ?? DEFAULTS.financing.enabled,
      allowedTerms: (f['allowedTerms'] as number[]) ?? DEFAULTS.financing.allowedTerms,
      annualInterestRate:
        (f['annualInterestRate'] as number) ?? DEFAULTS.financing.annualInterestRate,
      downPaymentPercent:
        (f['downPaymentPercent'] as number) ?? DEFAULTS.financing.downPaymentPercent,
      minFinanceableUsd: (f['minFinanceableUsd'] as number) ?? DEFAULTS.financing.minFinanceableUsd,
      notesEs: (fNotes['es'] as string) ?? '',
      notesEn: (fNotes['en'] as string) ?? '',
    },
    emails: {
      adminStaffDomain: (e['adminStaffDomain'] as string) ?? DEFAULTS.emails.adminStaffDomain,
      fromAddress: (e['fromAddress'] as string) ?? DEFAULTS.emails.fromAddress,
      fromName: (e['fromName'] as string) ?? DEFAULTS.emails.fromName,
    },
    payment: {
      bankAccountHolder: (p['bankAccountHolder'] as string) ?? DEFAULTS.payment.bankAccountHolder,
      bankName: (p['bankName'] as string) ?? DEFAULTS.payment.bankName,
      bankAccountType: (p['bankAccountType'] as string) ?? DEFAULTS.payment.bankAccountType,
      bankAccountNumber: (p['bankAccountNumber'] as string) ?? DEFAULTS.payment.bankAccountNumber,
      bankRuc: (p['bankRuc'] as string) ?? DEFAULTS.payment.bankRuc,
      bankNamePyg: (p['bankNamePyg'] as string) ?? DEFAULTS.payment.bankNamePyg,
      bankAccountNumberPyg:
        (p['bankAccountNumberPyg'] as string) ?? DEFAULTS.payment.bankAccountNumberPyg,
      bankAccountTypePyg:
        (p['bankAccountTypePyg'] as string) ?? DEFAULTS.payment.bankAccountTypePyg,
      depositPercent: (p['depositPercent'] as number) ?? DEFAULTS.payment.depositPercent,
      deadlineHours: (p['deadlineHours'] as number) ?? DEFAULTS.payment.deadlineHours,
      instructionsEs: (p['instructionsEs'] as string) ?? DEFAULTS.payment.instructionsEs,
      instructionsEn: (p['instructionsEn'] as string) ?? DEFAULTS.payment.instructionsEn,
      contactEmail: (p['contactEmail'] as string) ?? DEFAULTS.payment.contactEmail,
      contactPhone: (p['contactPhone'] as string) ?? DEFAULTS.payment.contactPhone,
    },
  };
});
