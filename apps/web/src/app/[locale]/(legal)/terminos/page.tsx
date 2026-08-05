import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/legal-page';
import { loadCompany } from '@/lib/legal/load-company';
import { termsSections } from '@/lib/legal/company-facts';

export const metadata: Metadata = {
  title: 'Términos y condiciones · Renew Subastas',
  description:
    'Condiciones de uso de Renew Subastas: quién puede pujar, cómo cierran las subastas, plazos de pago de la seña y estado de los vehículos.',
};

export default async function TermsPage({ params: { locale } }: { params: { locale: string } }) {
  const company = await loadCompany();
  return (
    <LegalPage
      locale={locale}
      title="Términos y condiciones"
      intro="Las reglas que rigen la participación en las subastas: pujas, adjudicación, plazos de pago y responsabilidades."
      sections={termsSections(company)}
      company={company}
    />
  );
}
