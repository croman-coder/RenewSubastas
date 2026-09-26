import { SITE_URL } from '@/lib/seo/site';
import { LANDING_FAQS } from '@/lib/seo/faq';
import type { Company } from '@/lib/legal/load-company';

interface Props {
  locale: string;
  company: Company;
}

/**
 * Renew's brand profiles, as linked from the Renew web footer
 * (renew-usados, 2026-09-26). Product constants like the logo, not company
 * identity, so they live here rather than in app_config. They tie the
 * auction site to the accounts that bring most of its traffic (Instagram
 * and Facebook, 77% in the audit) in search engines' knowledge graph.
 */
const SOCIAL_PROFILES = [
  'https://www.instagram.com/renewpy.sr',
  'https://www.facebook.com/renewpy.sr',
];

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
    // The app icon (1024×1024, app/icon.png) doubles as logo: a product
    // constant, not a claim about the company. Local results and the
    // knowledge panel show a blank tile without it.
    logo: `${SITE_URL}/icon.png`,
    image: `${SITE_URL}/icon.png`,
    sameAs: SOCIAL_PROFILES,
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
  // Top-level telephone is what local-business results read; the
  // contactPoint below keeps it tied to customer service.
  if (company.phone) data['telephone'] = company.phone;
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
