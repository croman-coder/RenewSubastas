import type { Metadata } from 'next';
import { canonicalUrl } from '@/lib/seo/site';
import { LegalPage } from '@/components/legal/legal-page';
import { loadCompany } from '@/lib/legal/load-company';
import { privacySections } from '@/lib/legal/company-facts';

export function generateMetadata({ params: { locale } }: { params: { locale: string } }): Metadata {
  return {
    title: 'Política de privacidad · Renew Subastas',
    description:
      'Cómo Renew Subastas recopila, usa, comparte y protege los datos personales de quienes participan en las subastas de vehículos.',
    alternates: { canonical: canonicalUrl(locale, '/privacidad') },
  };
}

export default async function PrivacyPage({ params: { locale } }: { params: { locale: string } }) {
  const company = await loadCompany();
  return (
    <LegalPage
      locale={locale}
      title="Política de privacidad"
      intro="Qué datos recopilamos cuando usás Renew Subastas, para qué los usamos y cómo podés controlarlos."
      sections={privacySections(company)}
      company={company}
    />
  );
}
