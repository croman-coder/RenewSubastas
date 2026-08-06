import 'server-only';
import { cache } from 'react';
import { getAdminApp } from '@/lib/firebase/admin';
import { getFirestore } from 'firebase-admin/firestore';

export interface Company {
  /** Razón social. */
  legalName: string;
  ruc: string;
  /** Domicilio legal. */
  address: string;
  email: string;
  phone: string;
}

const EMPTY: Company = { legalName: '', ruc: '', address: '', email: '', phone: '' };

/**
 * Company identity for the public legal pages.
 *
 * Reads `app_config/global` with the Admin SDK, so it works on pages served
 * to anonymous visitors even though `app_config` is admin/staff/finanzas-only
 * at the rules level (that restriction exists because the same document holds
 * the company's bank account number).
 *
 * Deliberately narrow: it returns five identity fields and nothing else.
 * Handing the whole config object to a public page is how the account number
 * ends up in an RSC payload — the exact leak the rules change closed. Add a
 * field here only if a public page genuinely needs it.
 *
 * `company.*` is the canonical source. It falls back to the payment block for
 * name/RUC/contact so the pages are populated before anyone fills the new
 * section in; `address` has no fallback and stays empty until configured,
 * which the pages surface rather than paper over.
 */
export const loadCompany = cache(async (): Promise<Company> => {
  try {
    const snap = await getFirestore(getAdminApp()).doc('app_config/global').get();
    const data = snap.data() ?? {};
    const company = (data['company'] ?? {}) as Partial<Company>;
    const payment = (data['payment'] ?? {}) as Record<string, string | undefined>;

    return {
      legalName: (company.legalName || payment['bankAccountHolder'] || '').trim(),
      ruc: (company.ruc || payment['bankRuc'] || '').trim(),
      address: (company.address || '').trim(),
      email: (company.email || payment['contactEmail'] || '').trim(),
      phone: (company.phone || payment['contactPhone'] || '').trim(),
    };
  } catch {
    // Config unreadable (cold start, permissions). The pages render their
    // "pending configuration" state rather than inventing an identity.
    return EMPTY;
  }
});
