import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/legal-page';
import { loadCompany } from '@/lib/legal/load-company';
import { cookieSections } from '@/lib/legal/company-facts';

export const metadata: Metadata = {
  title: 'Política de cookies · Renew Subastas',
  description:
    'Qué cookies usa Renew Subastas, cuáles son imprescindibles, cuáles dependen de tu consentimiento y cómo cambiar tu elección.',
};

export default async function CookiesPage({ params: { locale } }: { params: { locale: string } }) {
  const company = await loadCompany();
  return (
    <LegalPage
      locale={locale}
      title="Política de cookies"
      intro="Qué guardamos en tu dispositivo, por qué, y cómo cambiar tu decisión cuando quieras."
      sections={cookieSections(company)}
      company={company}
    />
  );
}
