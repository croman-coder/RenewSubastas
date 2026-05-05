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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Initial {
  primary: 'USD' | 'PYG';
  showSecondary: boolean;
  pygPerUsd: number | null;
}

export function CurrencyForm({ initial }: { initial: Initial }) {
  const t = useTranslations('admin.config');
  const router = useRouter();
  const [primary, setPrimary] = useState(initial.primary);
  const [showSecondary, setShowSecondary] = useState(initial.showSecondary);
  const [pygPerUsd, setPygPerUsd] = useState(initial.pygPerUsd?.toString() ?? '');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const payload: Record<string, unknown> = { primary, showSecondary };
      const n = Number(pygPerUsd);
      if (!Number.isNaN(n) && n > 0) payload.pygPerUsd = n;
      await httpsCallable(fb.functions, 'updateGlobalConfig')({ currency: payload });
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
      <h2 className="text-lg font-medium text-text-strong">{t('currency.title')}</h2>
      <div className="grid grid-cols-2 gap-4 max-w-lg">
        <div className="space-y-2">
          <Label>{t('currency.primary')}</Label>
          <Select value={primary} onValueChange={(v) => setPrimary(v as 'USD' | 'PYG')}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="USD">USD</SelectItem>
              <SelectItem value="PYG">PYG</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="pygPerUsd">{t('currency.pygPerUsd')}</Label>
          <Input
            id="pygPerUsd"
            type="number"
            step="0.01"
            value={pygPerUsd}
            onChange={(e) => setPygPerUsd(e.target.value)}
          />
        </div>
      </div>
      <div className="flex items-center justify-between max-w-lg">
        <span className="text-sm">{t('currency.showSecondary')}</span>
        <Switch checked={showSecondary} onCheckedChange={setShowSecondary} />
      </div>
      <Button onClick={save} disabled={busy}>
        {busy ? t('saving') : t('save')}
      </Button>
    </section>
  );
}
