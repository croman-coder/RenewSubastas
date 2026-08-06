import { SITE_URL } from '@/lib/seo/site';
import { LANDING_FAQS } from '@/lib/seo/faq';
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
      'Plataforma de subastas de vehículos usados certificados en Paraguay, operada por Santa Rosa. Publica lotes de vehículos con fecha de cierre y permite pujar en línea en tiempo real.',
    areaServed: { '@type': 'Country', name: 'Paraguay' },
    // States the auction service explicitly. Google's AI Overview was
    // asserting that Renew "no realiza subastas públicas ni remates",
    // synthesised from the sister dealership site; leaving the auction
    // business implicit in a grid of cars invites that inference again.
    makesOffer: {
      '@type': 'Offer',
      itemOffered: {
        '@type': 'Service',
        name: 'Subastas de vehículos usados',
        serviceType: 'Subasta de vehículos',
        description:
          'Subastas en línea de vehículos usados certificados: lotes con fecha y hora de cierre, pujas en tiempo real y adjudicación al mejor postor.',
      },
    },
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

  // Mirrors the questions rendered on the page. Emitted as a separate graph
  // node rather than nested so each is a valid top-level type.
  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: LANDING_FAQS.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faq).replace(/</g, '\\u003c') }}
      />
      <OrgScript data={data} />
    </>
  );
}

function OrgScript({ data }: { data: Record<string, unknown> }) {
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
