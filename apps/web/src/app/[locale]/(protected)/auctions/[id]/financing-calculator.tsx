'use client';
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
  currency: {
    primary: 'USD' | 'PYG';
    showSecondary: boolean;
    pygPerUsd: number | null;
  };
  locale: string;
}

// French amortization on an arbitrary principal in any currency. Lifted out
// of @carbid/shared-types so we can supply our own (custom) down payment in
// guaraníes instead of being locked to a percentage of the USD price.
function amortize(principal: number, termMonths: number, annualRate: number): number {
  if (principal <= 0 || termMonths <= 0) return 0;
  if (annualRate <= 0) return principal / termMonths;
  const r = annualRate / 12;
  return (principal * r) / (1 - Math.pow(1 + r, -termMonths));
}

const fmtPyg = (n: number) =>
  new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 }).format(Math.round(n));
const fmtUsd = (n: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n));

export function FinancingCalculator({ priceUsd, config, currency, locale }: Props) {
  const t = useTranslations('buyer.auctions.detail.financing');
  const sortedTerms = useMemo(
    () => [...config.allowedTerms].sort((a, b) => a - b),
    [config.allowedTerms],
  );
  const [term, setTerm] = useState<number>(sortedTerms[0] ?? 12);

  // Guaraníes are the operative currency for buyer financing in Paraguay even
  // though the auction is priced in USD. Fall back to a 1:1 placeholder rate
  // if the admin hasn't configured pygPerUsd yet — better to show something
  // than to render a blank card.
  const pygPerUsd = currency.pygPerUsd && currency.pygPerUsd > 0 ? currency.pygPerUsd : 1;
  const usingPlaceholder = !currency.pygPerUsd || currency.pygPerUsd <= 0;
  const pricePyg = priceUsd * pygPerUsd;

  // Editable down payment, defaults to (price * configured percent) in guaraníes.
  const defaultDownPyg = Math.round(pricePyg * config.downPaymentPercent);
  const [downPyg, setDownPyg] = useState<string>(String(defaultDownPyg));
  // Refresh default when the live price changes (e.g. a new top bid arrives).
  useEffect(() => {
    setDownPyg(String(Math.round(priceUsd * pygPerUsd * config.downPaymentPercent)));
  }, [priceUsd, pygPerUsd, config.downPaymentPercent]);

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

  const downRaw = Number(downPyg.replace(/[^0-9]/g, ''));
  const down = Number.isFinite(downRaw) && downRaw >= 0 ? downRaw : 0;
  const cappedDown = Math.min(down, pricePyg);
  const principal = pricePyg - cappedDown;
  const monthly = amortize(principal, term, config.annualInterestRate);
  const totalToPay = monthly * term + cappedDown;
  const totalInterest = totalToPay - pricePyg;

  const notes = locale === 'en' && config.notesEn ? config.notesEn : config.notesEs;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('title')}</CardTitle>
        <p className="text-xs text-text-muted">{t('subtitle')}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Plazo</Label>
          <Select value={String(term)} onValueChange={(v) => setTerm(Number(v))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sortedTerms.map((months) => (
                <SelectItem key={months} value={String(months)}>
                  {months} meses
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="downPayment">Entrega inicial (Gs.)</Label>
          <Input
            id="downPayment"
            type="text"
            inputMode="numeric"
            value={fmtPyg(down)}
            onChange={(e) => setDownPyg(e.target.value.replace(/[^0-9]/g, ''))}
            className="num-tab"
          />
          <p className="text-xs text-text-muted">
            Sugerido: Gs. {fmtPyg(defaultDownPyg)} ({Math.round(config.downPaymentPercent * 100)}%
            del precio)
          </p>
        </div>

        <Separator />

        <dl className="space-y-2 text-sm">
          <Row
            label="Precio"
            value={`Gs. ${fmtPyg(pricePyg)}`}
            subvalue={`USD ${fmtUsd(priceUsd)}`}
          />
          <Row label="Entrega inicial" value={`Gs. ${fmtPyg(cappedDown)}`} />
          <Row
            label="Cuota mensual"
            value={`Gs. ${fmtPyg(monthly)}`}
            subvalue={`× ${term} meses`}
            emphasis
          />
          <Row label="Total a pagar" value={`Gs. ${fmtPyg(totalToPay)}`} />
          <Row label="Intereses" value={`Gs. ${fmtPyg(totalInterest)}`} />
        </dl>

        {usingPlaceholder && (
          <p className="text-xs text-warning">
            ⚠ El admin todavía no configuró el tipo de cambio Gs./USD. La calculadora muestra
            valores 1:1 hasta que se cargue.
          </p>
        )}

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

function Row({
  label,
  value,
  subvalue,
  emphasis,
}: {
  label: string;
  value: string;
  subvalue?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-right">
        <div className={emphasis ? 'text-lg font-semibold num-tab' : 'num-tab'}>{value}</div>
        {subvalue && <div className="text-xs text-text-muted num-tab">{subvalue}</div>}
      </dd>
    </div>
  );
}
