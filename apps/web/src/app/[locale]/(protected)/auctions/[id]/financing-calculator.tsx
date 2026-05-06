'use client';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { calculateInstallment } from '@carbid/shared-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

interface Props {
  priceUsd: number;
  config: {
    enabled: boolean;
    allowedTerms: number[];
    annualInterestRate: number;
    downPaymentPercent: number;
    minFinanceableUsd: number;
    notesEs: string;
    notesEn: string;
  };
  locale: string;
}

export function FinancingCalculator({ priceUsd, config, locale }: Props) {
  const t = useTranslations('buyer.auctions.detail.financing');
  const sortedTerms = useMemo(
    () => [...config.allowedTerms].sort((a, b) => a - b),
    [config.allowedTerms],
  );
  const [term, setTerm] = useState<number>(sortedTerms[0] ?? 12);

  if (!config.enabled) return null;

  if (priceUsd < config.minFinanceableUsd) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-text-muted">
            {t('minNotReached', { amount: config.minFinanceableUsd.toLocaleString() })}
          </p>
        </CardContent>
      </Card>
    );
  }

  const result = calculateInstallment({
    priceUsd,
    termMonths: term,
    annualInterestRate: config.annualInterestRate,
    downPaymentPercent: config.downPaymentPercent,
  });

  const notes = locale === 'en' && config.notesEn ? config.notesEn : config.notesEs;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('title')}</CardTitle>
        <p className="text-xs text-text-muted">{t('subtitle')}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <p className="text-xs text-text-muted">{t('term')}</p>
          <div className="flex flex-wrap gap-2">
            {sortedTerms.map((months) => (
              <Button
                key={months}
                type="button"
                size="sm"
                variant={months === term ? 'default' : 'outline'}
                onClick={() => setTerm(months)}
              >
                {t('termMonths', { count: months })}
              </Button>
            ))}
          </div>
        </div>
        <Separator />
        <dl className="space-y-2 text-sm">
          <Row label={t('downPayment')} value={`USD ${result.downPayment.toLocaleString()}`} />
          <Row label={t('monthly')} value={`USD ${result.monthly.toLocaleString()}`} emphasis />
          <Row label={t('totalToPay')} value={`USD ${result.totalToPay.toLocaleString()}`} />
          <Row label={t('totalInterest')} value={`USD ${result.totalInterest.toLocaleString()}`} />
        </dl>
        {notes && (
          <>
            <Separator />
            <details>
              <summary className="text-xs text-text-muted cursor-pointer">{t('notes')}</summary>
              <p className="text-xs text-text-muted mt-2 whitespace-pre-line">{notes}</p>
            </details>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-text-muted">{label}</dt>
      <dd className={emphasis ? 'text-lg font-semibold num-tab' : 'num-tab'}>{value}</dd>
    </div>
  );
}
