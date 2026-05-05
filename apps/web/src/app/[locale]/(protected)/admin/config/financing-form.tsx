'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { httpsCallable } from 'firebase/functions';
import { toast } from 'sonner';
import { fb } from '@/lib/firebase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

interface Initial {
  enabled: boolean;
  allowedTerms: number[];
  annualInterestRate: number;
  downPaymentPercent: number;
  minFinanceableUsd: number;
  notesEs: string;
  notesEn: string;
}

export function FinancingForm({ initial }: { initial: Initial }) {
  const t = useTranslations('admin.config');
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [terms, setTerms] = useState(initial.allowedTerms.join(','));
  const [rate, setRate] = useState(String(initial.annualInterestRate));
  const [down, setDown] = useState(String(initial.downPaymentPercent));
  const [minAmt, setMinAmt] = useState(String(initial.minFinanceableUsd));
  const [notesEs, setNotesEs] = useState(initial.notesEs);
  const [notesEn, setNotesEn] = useState(initial.notesEn);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const allowedTerms = terms
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0);
      const payload: Record<string, unknown> = {
        enabled,
        allowedTerms,
        annualInterestRate: Number(rate),
        downPaymentPercent: Number(down),
        minFinanceableUsd: Number(minAmt),
      };
      if (notesEs) {
        payload.notes = { es: notesEs, ...(notesEn && { en: notesEn }) };
      }
      await httpsCallable(fb.functions, 'updateGlobalConfig')({ financing: payload });
      toast.success(t('saved'));
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message ?? t('errors.generic'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-medium text-text-strong">{t('financing.title')}</h2>
      <div className="flex items-center justify-between max-w-lg">
        <span className="text-sm">{t('financing.enabled')}</span>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>
      <div className="space-y-2 max-w-lg">
        <Label htmlFor="terms">{t('financing.allowedTerms')}</Label>
        <Input id="terms" value={terms} onChange={(e) => setTerms(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-4 max-w-lg">
        <div className="space-y-2">
          <Label htmlFor="rate">{t('financing.annualInterestRate')}</Label>
          <Input
            id="rate"
            type="number"
            step="0.01"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="down">{t('financing.downPaymentPercent')}</Label>
          <Input
            id="down"
            type="number"
            step="0.01"
            value={down}
            onChange={(e) => setDown(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-2 max-w-lg">
        <Label htmlFor="minAmt">{t('financing.minFinanceableUsd')}</Label>
        <Input
          id="minAmt"
          type="number"
          value={minAmt}
          onChange={(e) => setMinAmt(e.target.value)}
        />
      </div>
      <div className="space-y-2 max-w-lg">
        <Label htmlFor="notesEs">{t('financing.notesEs')}</Label>
        <Input id="notesEs" value={notesEs} onChange={(e) => setNotesEs(e.target.value)} />
      </div>
      <div className="space-y-2 max-w-lg">
        <Label htmlFor="notesEn">{t('financing.notesEn')}</Label>
        <Input id="notesEn" value={notesEn} onChange={(e) => setNotesEn(e.target.value)} />
      </div>
      <Button onClick={save} disabled={busy}>
        {busy ? t('saving') : t('save')}
      </Button>
    </section>
  );
}
