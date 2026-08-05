import { SITE_URL } from '@/lib/seo/site';
import type { Company } from '@/lib/legal/load-company';

interface Props {
  locale: string;
  company: Company;
}

/**
 * Organization structured data for the landing.
 *
 * Every value is either a constant of this product or comes from the
 * configured company identity — nothing is asserted that an admin hasn't
 * entered. Fields left unconfigured are omitted rather than emitted empty:
 * a blank `taxID` or `address` in JSON-LD is worse than its absence, since
 * search engines treat it as a claim.
 */
export function OrganizationJsonLd({ locale, company }: Props) {
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'AutoDealer',
    name: 'Renew Subastas',
    url: `${SITE_URL}/${locale}`,
    description:
      'Plataforma de subastas de vehículos usados certificados en Paraguay, operada por Santa Rosa.',
    areaServed: { '@type': 'Country', name: 'Paraguay' },
  };

  if (company.legalName) data['legalName'] = company.legalName;
  if (company.ruc) data['taxID'] = company.ruc;
  if (company.address) {
    data['address'] = { '@type': 'PostalAddress', streetAddress: company.address };
  }
  if (company.email || company.phone) {
    data['contactPoint'] = {
      '@type': 'ContactPoint',
      contactType: 'customer service',
      ...(company.email ? { email: company.email } : {}),
      ...(company.phone ? { telephone: company.phone } : {}),
    };
  }

  return (
    <script
      type="application/ld+json"
      // JSON.stringify output is injected into a <script> block, so the only
      // break-out risk is a literal "</script>" inside a configured value.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, '\\u003c'),
      }}
    />
  );
}
