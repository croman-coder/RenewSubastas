'use client';
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Calculator } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  // if the admin hasn't configured pygPerUsd yet.
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
      <div className="rounded-2xl border border-text-subtle/15 bg-bg-elev/50 p-5 space-y-2">
        <Header />
        <p className="text-sm text-text-muted">
          {t('minNotReached', { amount: config.minFinanceableUsd.toLocaleString() })}
        </p>
      </div>
    );
  }

  const downRaw = Number(downPyg.replace(/[^0-9]/g, ''));
  const down = Number.isFinite(downRaw) && downRaw >= 0 ? downRaw : 0;
  const cappedDown = Math.min(down, pricePyg);
  const principal = pricePyg - cappedDown;
  const monthly = amortize(principal, term, config.annualInterestRate);

  const notes = locale === 'en' && config.notesEn ? config.notesEn : config.notesEs;

  return (
    <div className="rounded-2xl border border-text-subtle/15 bg-bg-elev/50 p-5 space-y-5">
      <Header subtitle={t('subtitle')} />

      <div className="space-y-2">
        <Label className="text-[11px] uppercase tracking-[0.1em] font-semibold text-text-muted">
          Plazo
        </Label>
        <Select value={String(term)} onValueChange={(v) => setTerm(Number(v))}>
          <SelectTrigger className="h-11 rounded-xl bg-bg-deep/60 border-text-subtle/20 hover:border-copper/40 focus:ring-copper/30 transition-colors text-base font-medium num-tab">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            {sortedTerms.map((months) => (
              <SelectItem
                key={months}
                value={String(months)}
                className="text-base num-tab cursor-pointer"
              >
                {months} meses
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="downPayment"
          className="text-[11px] uppercase tracking-[0.1em] font-semibold text-text-muted"
        >
          Entrega inicial · Gs.
        </Label>
        <Input
          id="downPayment"
          type="text"
          inputMode="numeric"
          value={fmtPyg(down)}
          onChange={(e) => setDownPyg(e.target.value.replace(/[^0-9]/g, ''))}
          className="h-11 rounded-xl bg-bg-deep/60 border-text-subtle/20 text-base font-semibold num-tab tracking-tight focus:border-copper/40 focus:ring-copper/30"
        />
        <p className="text-[11px] text-text-muted">
          Sugerido:{' '}
          <span className="num-tab text-text-strong font-medium">Gs. {fmtPyg(defaultDownPyg)}</span>{' '}
          ({Math.round(config.downPaymentPercent * 100)}% del precio)
        </p>
      </div>

      {/* Highlighted monthly payment */}
      <div className="relative overflow-hidden rounded-2xl border border-copper/30 bg-gradient-to-br from-copper/[0.08] via-copper/[0.04] to-transparent p-5">
        <div
          aria-hidden
          className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-copper/10 blur-3xl pointer-events-none"
        />
        <div className="relative">
          <p className="text-[11px] uppercase tracking-[0.12em] font-semibold text-copper/80">
            Cuota mensual
          </p>
          <p
            className="mt-1 text-3xl sm:text-4xl font-bold tracking-tight num-tab text-copper leading-tight"
            style={{ textShadow: '0 0 20px rgba(205,155,79,0.3)' }}
          >
            <span className="text-base font-semibold mr-1 opacity-80">Gs.</span>
            {fmtPyg(monthly)}
          </p>
          <p className="mt-1 text-xs text-text-muted num-tab">
            × {term} {term === 1 ? 'mes' : 'meses'}
          </p>
        </div>
      </div>

      <dl className="space-y-2.5 pt-1">
        <Row
          label="Precio"
          value={`Gs. ${fmtPyg(pricePyg)}`}
          subvalue={`USD ${fmtUsd(priceUsd)}`}
        />
        <Row label="Entrega inicial" value={`Gs. ${fmtPyg(cappedDown)}`} />
      </dl>

      {usingPlaceholder && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          El admin todavía no configuró el tipo de cambio Gs./USD. La calculadora muestra valores
          1:1 hasta que se cargue.
        </div>
      )}

      {notes && (
        <details className="border-t border-text-subtle/15 pt-3">
          <summary className="text-[11px] uppercase tracking-[0.1em] font-semibold text-text-muted cursor-pointer hover:text-text-strong transition-colors">
            {t('notes')}
          </summary>
          <p className="text-xs text-text-muted mt-2 whitespace-pre-line leading-relaxed">
            {notes}
          </p>
        </details>
      )}
    </div>
  );
}

function Header({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="w-7 h-7 rounded-md bg-copper/15 text-copper grid place-items-center shrink-0">
        <Calculator className="w-4 h-4" strokeWidth={2.5} />
      </span>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold tracking-tight text-text-strong">
          Calculadora de cuotas
        </h3>
        {subtitle && <p className="text-[11px] text-text-muted mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function Row({ label, value, subvalue }: { label: string; value: string; subvalue?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-right">
        <div className="text-text-strong num-tab font-medium tracking-tight">{value}</div>
        {subvalue && <div className="text-[11px] text-text-muted num-tab">{subvalue}</div>}
      </dd>
    </div>
  );
}
