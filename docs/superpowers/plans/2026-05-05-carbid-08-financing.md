# CARBID Plan 8 — Financing Calculator

> REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute task-by-task.

**Goal:** Buyers see a financing simulator on every live auction detail page when `app_config.financing.enabled = true` and the auction's current price is `>= minFinanceableUsd`. The buyer picks one of the configured terms (12/24/36/48/60 months) and sees down payment, monthly installment, total to pay, and total interest. Includes legal notes from `app_config.financing.notes`.

**Architecture:**

- Pure math helper `calculateInstallment(args)` lives in `@carbid/shared-types` — no Cloud Function needed (deterministic, no DB access). Reused by the UI.
- Auction detail page loads `app_config.financing` server-side (already does for the bid panel).
- New client component `FinancingCalculator` renders a card with term chips + computed numbers; reactive to `currentBid` from the `onSnapshot` listener.

**Spec reference:** §4 (`app_config.financing`), §5 (`financing.calculateInstallments`), §6 buyer detail "Calculadora de cuotas".

**Prerequisites:** Plans 1-7 complete.

**Formula** — standard amortization:

```
principal = priceUsd * (1 - downPaymentPercent)
monthlyRate = annualRate / 12
monthly = principal * monthlyRate / (1 - (1 + monthlyRate)^(-term))
totalToPay = monthly * term + downPayment
totalInterest = totalToPay - priceUsd
```

Edge case: if `annualRate === 0`, fall back to `monthly = principal / term`.

---

## File Structure

```
packages/shared-types/src/
├── financing.ts
└── financing.test.ts

apps/web/src/app/[locale]/(protected)/auctions/[id]/
├── financing-calculator.tsx    new client component
└── auction-detail-view.tsx     pass financingConfig prop, render calculator
```

---

## Task 1: Pure helper + tests

- [ ] **Step 1.1: Implement** `packages/shared-types/src/financing.ts`:

```ts
export interface InstallmentArgs {
  priceUsd: number;
  termMonths: number;
  annualInterestRate: number; // 0.18 = 18%
  downPaymentPercent: number; // 0.2 = 20%
}

export interface InstallmentResult {
  downPayment: number;
  principal: number;
  monthly: number;
  totalToPay: number;
  totalInterest: number;
}

/**
 * Standard French amortization (equal monthly installments).
 * Returns 0 for invalid inputs (negative numbers, term <= 0) so the UI
 * can render gracefully without throwing.
 */
export function calculateInstallment(args: InstallmentArgs): InstallmentResult {
  const { priceUsd, termMonths, annualInterestRate, downPaymentPercent } = args;
  if (
    priceUsd <= 0 ||
    termMonths <= 0 ||
    annualInterestRate < 0 ||
    downPaymentPercent < 0 ||
    downPaymentPercent >= 1
  ) {
    return { downPayment: 0, principal: 0, monthly: 0, totalToPay: 0, totalInterest: 0 };
  }
  const downPayment = round2(priceUsd * downPaymentPercent);
  const principal = round2(priceUsd - downPayment);

  let monthly: number;
  if (annualInterestRate === 0) {
    monthly = principal / termMonths;
  } else {
    const r = annualInterestRate / 12;
    monthly = (principal * r) / (1 - Math.pow(1 + r, -termMonths));
  }
  monthly = round2(monthly);
  const totalToPay = round2(monthly * termMonths + downPayment);
  const totalInterest = round2(totalToPay - priceUsd);
  return { downPayment, principal, monthly, totalToPay, totalInterest };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
```

- [ ] **Step 1.2: Tests** `packages/shared-types/src/financing.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { calculateInstallment } from './financing';

describe('calculateInstallment', () => {
  it('returns zeros for invalid inputs', () => {
    expect(
      calculateInstallment({
        priceUsd: 0,
        termMonths: 12,
        annualInterestRate: 0.1,
        downPaymentPercent: 0.2,
      }),
    ).toEqual({ downPayment: 0, principal: 0, monthly: 0, totalToPay: 0, totalInterest: 0 });
    expect(
      calculateInstallment({
        priceUsd: 10000,
        termMonths: 0,
        annualInterestRate: 0.1,
        downPaymentPercent: 0.2,
      }).monthly,
    ).toBe(0);
    expect(
      calculateInstallment({
        priceUsd: 10000,
        termMonths: 12,
        annualInterestRate: -0.1,
        downPaymentPercent: 0.2,
      }).monthly,
    ).toBe(0);
    expect(
      calculateInstallment({
        priceUsd: 10000,
        termMonths: 12,
        annualInterestRate: 0.1,
        downPaymentPercent: 1.5,
      }).monthly,
    ).toBe(0);
  });

  it('zero interest splits principal evenly across term', () => {
    const r = calculateInstallment({
      priceUsd: 12000,
      termMonths: 12,
      annualInterestRate: 0,
      downPaymentPercent: 0,
    });
    expect(r.downPayment).toBe(0);
    expect(r.principal).toBe(12000);
    expect(r.monthly).toBe(1000);
    expect(r.totalToPay).toBe(12000);
    expect(r.totalInterest).toBe(0);
  });

  it('20% down + zero interest', () => {
    const r = calculateInstallment({
      priceUsd: 10000,
      termMonths: 10,
      annualInterestRate: 0,
      downPaymentPercent: 0.2,
    });
    expect(r.downPayment).toBe(2000);
    expect(r.principal).toBe(8000);
    expect(r.monthly).toBe(800);
    expect(r.totalToPay).toBe(10000);
  });

  it('matches French-amortization formula at 12% annual / 12 months', () => {
    // principal=10000, r=0.01, n=12 → monthly = 10000*0.01/(1-1.01^-12) = 888.49
    const r = calculateInstallment({
      priceUsd: 10000,
      termMonths: 12,
      annualInterestRate: 0.12,
      downPaymentPercent: 0,
    });
    expect(r.monthly).toBeCloseTo(888.49, 1);
    // total interest ~ 661.85
    expect(r.totalInterest).toBeGreaterThan(600);
    expect(r.totalInterest).toBeLessThan(700);
  });

  it('higher term → lower monthly, higher total interest', () => {
    const short = calculateInstallment({
      priceUsd: 20000,
      termMonths: 12,
      annualInterestRate: 0.18,
      downPaymentPercent: 0.2,
    });
    const long = calculateInstallment({
      priceUsd: 20000,
      termMonths: 60,
      annualInterestRate: 0.18,
      downPaymentPercent: 0.2,
    });
    expect(long.monthly).toBeLessThan(short.monthly);
    expect(long.totalInterest).toBeGreaterThan(short.totalInterest);
  });

  it('keeps results stable to 2 decimals', () => {
    const r = calculateInstallment({
      priceUsd: 15000,
      termMonths: 36,
      annualInterestRate: 0.15,
      downPaymentPercent: 0.25,
    });
    // sanity-check the rounding pattern
    expect(Number.isFinite(r.monthly)).toBe(true);
    expect(r.monthly).toBe(Math.round(r.monthly * 100) / 100);
  });
});
```

- [ ] **Step 1.3: Export** from `packages/shared-types/src/index.ts`:

```ts
export * from './financing';
```

- [ ] **Step 1.4: Run tests + rebuild + commit**

```
pnpm --filter @carbid/shared-types test  # 9 prior + 6 new = 15
pnpm --filter @carbid/shared-types build
pnpm --filter @carbid/functions build  # picks up new shared-types dist
git add packages/shared-types/src/financing.ts packages/shared-types/src/financing.test.ts packages/shared-types/src/index.ts
git commit -m "feat(shared-types): pure calculateInstallment helper with tests"
```

---

## Task 2: UI calculator + integration

- [ ] **Step 2.1: i18n** — append to `messages/es.json` inside `buyer.auctions.detail`:

```json
"financing": {
  "title": "Calculadora de cuotas",
  "subtitle": "Simulación, sujeta a aprobación.",
  "term": "Plazo",
  "termMonths": "{count} meses",
  "downPayment": "Entrada",
  "monthly": "Cuota mensual",
  "totalToPay": "Total a pagar",
  "totalInterest": "Intereses",
  "minNotReached": "Disponible para montos desde USD {amount}.",
  "notes": "Notas legales"
}
```

Same in en.json.

- [ ] **Step 2.2: Component** `apps/web/src/app/[locale]/(protected)/auctions/[id]/financing-calculator.tsx`:

```tsx
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
```

- [ ] **Step 2.3: Integrate** into `auction-detail-view.tsx`:

The page already loads `loadAppConfigSnapshot()` (Plan 6) and passes `allowManualIncrement`. Now also pass the full `financing` block so the calculator can render.

Modify `[id]/page.tsx`:

```tsx
return (
  <AuctionDetailView
    locale={locale}
    initial={auction}
    myUid={user.uid}
    allowManualIncrement={config.bid.allowManualIncrement}
    financingConfig={config.financing}
  />
);
```

Modify `auction-detail-view.tsx`:

- Add prop `financingConfig: AppConfigSnapshot['financing']` (import the type from `@/lib/admin/load-app-config`).
- Add import `import { FinancingCalculator } from './financing-calculator';`
- Render `<FinancingCalculator priceUsd={displayPrice} config={financingConfig} locale={locale} />` in the sticky aside, AFTER the `<BidPanel />`.

`displayPrice` is already computed: `live.currentBid > 0 ? live.currentBid : initial.startingPrice`.

- [ ] **Step 2.4: Build, format, commit**

```
pnpm --filter @carbid/web typecheck
pnpm --filter @carbid/web build
pnpm format
git add apps/web/src/app/[locale]/'(protected)'/auctions/'[id]' apps/web/messages
git commit -m "feat(web): financing calculator card on buyer auction detail"
```

---

## Task 3: Smoke test

1. Login admin → `/admin/config` → "Financiación" section.
2. Toggle "Habilitar cuotas" ON. Set:
   - Plazos: `12,24,36,48,60`
   - Tasa anual: `0.18`
   - Entrada: `0.2`
   - Mínimo financiable: `5000`
   - Notas (ES): "Sujeto a evaluación crediticia. Tasas pueden variar."
3. Save.
4. Navigate to `/auctions` → click on an auction with currentBid >= 5000 (e.g. VW Amarok at 15000).
5. Detail page sticky aside: NEW card "Calculadora de cuotas" appears below the bid panel.
6. Click term chips (12/24/36/48/60) → values reactively update.
7. Click "Notas legales" details → expands.
8. Visit a low-priced auction (e.g. one under 5000 if any) → calculator shows "Disponible para montos desde USD 5,000."

---

## Self-Review

Spec coverage:

- §4 `app_config.financing` consumed correctly ✅
- §5 `financing.calculateInstallments` — implemented as pure helper instead of Cloud Function (no DB access; no need for round-trip). Note in this plan.
- §6 buyer detail Calculadora de cuotas ✅
- "Simulación, sujeta a aprobación" label ✅
- Reactive to currentBid (re-renders when `live.currentBid` changes via `onSnapshot`) ✅

Out of scope:

- Saving simulation results (post-MVP)
- Pre-qualification / credit scoring (out of MVP scope entirely)

---

## Execution Handoff

Recommended single batch (small):

- Batch TT: Tasks 1+2 in one go.
