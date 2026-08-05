import { getTranslations } from 'next-intl/server';
import { loadAppConfigSnapshot } from '@/lib/admin/load-app-config';
import { CurrencyForm } from './currency-form';
import { BidForm } from './bid-form';
import { FinancingForm } from './financing-form';
import { EmailsForm } from './emails-form';
import { PaymentForm } from './payment-form';
import { CompanyForm } from './company-form';
import { loadCompany } from '@/lib/legal/load-company';
import { Separator } from '@/components/ui/separator';

export default async function AdminConfigPage() {
  const t = await getTranslations('admin.config');
  const [cfg, company] = await Promise.all([loadAppConfigSnapshot(), loadCompany()]);
  return (
    <div className="max-w-3xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-text-strong">{t('title')}</h1>
        <p className="text-sm text-text-muted">{t('subtitle')}</p>
      </header>
      <CompanyForm initial={company} />
      <Separator />
      <CurrencyForm initial={cfg.currency} />
      <Separator />
      <BidForm initial={cfg.bid} />
      <Separator />
      <FinancingForm initial={cfg.financing} />
      <Separator />
      <EmailsForm initial={cfg.emails} />
      <Separator />
      <PaymentForm initial={cfg.payment} />
    </div>
  );
}
