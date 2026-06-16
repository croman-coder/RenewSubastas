import { adminDb } from './admin.js';

export interface PaymentConfig {
  bankAccountHolder: string;
  bankName: string;
  bankAccountNumber: string;
  bankAccountType: string;
  bankRuc: string;
  /** Second bank account, denominated in guaraníes (PYG). Holder + RUC are
   *  shared with the USD account above. Empty when not configured. */
  bankNamePyg: string;
  bankAccountNumberPyg: string;
  bankAccountTypePyg: string;
  /** Deposit fraction (0..1). 0.10 = 10% seña. */
  depositPercent: number;
  /** Hours after auction close before the win is forfeited. */
  deadlineHours: number;
  instructionsEs: string;
  instructionsEn: string;
  contactEmail: string;
  contactPhone: string;
}

export interface RuntimeConfig {
  emails: {
    adminStaffDomain: string;
    fromAddress: string;
    fromName: string;
  };
  payment: PaymentConfig;
}

const DEFAULT_CONFIG: RuntimeConfig = {
  emails: {
    adminStaffDomain: 'santarosa.com.py',
    fromAddress: 'noreply@renewsubastas.com.py',
    fromName: 'Renew Subastas',
  },
  payment: {
    bankAccountHolder: '',
    bankName: '',
    bankAccountNumber: '',
    bankAccountType: '',
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

export async function loadAppConfig(): Promise<RuntimeConfig> {
  const snap = await adminDb().doc('app_config/global').get();
  if (!snap.exists) return DEFAULT_CONFIG;
  const data = snap.data() ?? {};
  const emails = (data['emails'] ?? {}) as Partial<RuntimeConfig['emails']>;
  const payment = (data['payment'] ?? {}) as Partial<PaymentConfig>;
  return {
    emails: {
      adminStaffDomain: emails.adminStaffDomain ?? DEFAULT_CONFIG.emails.adminStaffDomain,
      fromAddress: emails.fromAddress ?? DEFAULT_CONFIG.emails.fromAddress,
      fromName: emails.fromName ?? DEFAULT_CONFIG.emails.fromName,
    },
    payment: {
      bankAccountHolder: payment.bankAccountHolder ?? DEFAULT_CONFIG.payment.bankAccountHolder,
      bankName: payment.bankName ?? DEFAULT_CONFIG.payment.bankName,
      bankAccountNumber: payment.bankAccountNumber ?? DEFAULT_CONFIG.payment.bankAccountNumber,
      bankAccountType: payment.bankAccountType ?? DEFAULT_CONFIG.payment.bankAccountType,
      bankRuc: payment.bankRuc ?? DEFAULT_CONFIG.payment.bankRuc,
      bankNamePyg: payment.bankNamePyg ?? DEFAULT_CONFIG.payment.bankNamePyg,
      bankAccountNumberPyg:
        payment.bankAccountNumberPyg ?? DEFAULT_CONFIG.payment.bankAccountNumberPyg,
      bankAccountTypePyg: payment.bankAccountTypePyg ?? DEFAULT_CONFIG.payment.bankAccountTypePyg,
      depositPercent: payment.depositPercent ?? DEFAULT_CONFIG.payment.depositPercent,
      deadlineHours: payment.deadlineHours ?? DEFAULT_CONFIG.payment.deadlineHours,
      instructionsEs: payment.instructionsEs ?? DEFAULT_CONFIG.payment.instructionsEs,
      instructionsEn: payment.instructionsEn ?? DEFAULT_CONFIG.payment.instructionsEn,
      contactEmail: payment.contactEmail ?? DEFAULT_CONFIG.payment.contactEmail,
      contactPhone: payment.contactPhone ?? DEFAULT_CONFIG.payment.contactPhone,
    },
  };
}
