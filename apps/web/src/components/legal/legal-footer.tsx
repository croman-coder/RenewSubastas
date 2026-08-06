import Link from 'next/link';
import { CookiePreferencesButton } from './cookie-preferences-button';
import type { Company } from '@/lib/legal/load-company';

interface Props {
  locale: string;
  company: Company;
}

export const LEGAL_LINKS = [
  { href: 'terminos', label: 'Términos y condiciones' },
  { href: 'privacidad', label: 'Política de privacidad' },
  { href: 'cookies', label: 'Política de cookies' },
] as const;

/**
 * Footer carrying the legal identity and the three policy links.
 *
 * Shared by the landing and the legal pages so the identity block is written
 * once — a company name that disagrees between two footers is the kind of
 * detail that undermines a legal page.
 */
export function LegalFooter({ locale, company }: Props) {
  return (
    <footer className="mt-12 border-t border-text-subtle/15">
      <div className="mx-auto max-w-7xl px-4 md:px-8 py-8 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        {/* Company line only. RUC, address and contact stay out of the
            footer by request — they're still stated where they're actually
            required, in the "Quién trata tus datos" section of the privacy
            policy and the opening clause of the terms, both fed from the
            same configured values. */}
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-text-strong">
            <span translate="no">Renew Subastas</span>
          </p>
          {company.legalName && <p className="text-xs text-text-muted">{company.legalName}</p>}
        </div>

        <nav aria-label="Enlaces legales" className="shrink-0">
          <ul className="flex flex-col gap-2 text-xs sm:items-end">
            {LEGAL_LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={`/${locale}/${l.href}` as `/${string}`}
                  className="text-text-muted hover:text-text-strong transition-colors duration-200 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-text-strong/40"
                >
                  {l.label}
                </Link>
              </li>
            ))}
            <li>
              <CookiePreferencesButton />
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
