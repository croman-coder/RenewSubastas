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
  fixedIncrementUsd: number;
  allowManualIncrement: boolean;
  antiSnipingSeconds: number;
}

export function BidForm({ initial }: { initial: Initial }) {
  const t = useTranslations('admin.config');
  const router = useRouter();
  const [increment, setIncrement] = useState(String(initial.fixedIncrementUsd));
  const [allowManual, setAllowManual] = useState(initial.allowManualIncrement);
  const [antiSniping, setAntiSniping] = useState(String(initial.antiSnipingSeconds));
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await httpsCallable(
        fb.functions,
        'updateGlobalConfig',
      )({
        bid: {
          fixedIncrementUsd: Number(increment),
          allowManualIncrement: allowManual,
          antiSnipingSeconds: Number(antiSniping),
        },
      });
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
      <h2 className="text-lg font-medium text-text-strong">{t('bid.title')}</h2>
      <div className="grid grid-cols-2 gap-4 max-w-lg">
        <div className="space-y-2">
          <Label htmlFor="increment">{t('bid.fixedIncrementUsd')}</Label>
          <Input
            id="increment"
            type="number"
            value={increment}
            onChange={(e) => setIncrement(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="antiSniping">{t('bid.antiSnipingSeconds')}</Label>
          <Input
            id="antiSniping"
            type="number"
            value={antiSniping}
            onChange={(e) => setAntiSniping(e.target.value)}
          />
        </div>
      </div>
      <div className="flex items-center justify-between max-w-lg">
        <span className="text-sm">{t('bid.allowManualIncrement')}</span>
        <Switch checked={allowManual} onCheckedChange={setAllowManual} />
      </div>
      <Button onClick={save} disabled={busy}>
        {busy ? t('saving') : t('save')}
      </Button>
    </section>
  );
}
