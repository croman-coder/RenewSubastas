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
import { Textarea } from '@/components/ui/textarea';

interface Initial {
  bankAccountHolder: string;
  bankName: string;
  bankAccountType: string;
  bankAccountNumber: string;
  bankRuc: string;
  depositPercent: number;
  deadlineHours: number;
  instructionsEs: string;
  instructionsEn: string;
  contactEmail: string;
  contactPhone: string;
}

/**
 * Admin form for the payment-on-win configuration. Whatever the admin
 * types here lands on the auction-won email and on the buyer's won
 * detail page. Empty strings are valid — when the bank block is empty
 * the email + page show a fallback ("the admin will contact you with
 * bank details") so we never email the winner an unfinished template.
 */
export function PaymentForm({ initial }: { initial: Initial }) {
  const t = useTranslations('admin.config');
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);

  function update<K extends keyof Initial>(k: K, val: Initial[K]) {
    setV((prev) => ({ ...prev, [k]: val }));
  }

  async function save() {
    setBusy(true);
    try {
      await httpsCallable(
        fb.functions,
        'updateGlobalConfig',
      )({
        payment: {
          bankAccountHolder: v.bankAccountHolder,
          bankName: v.bankName,
          bankAccountType: v.bankAccountType,
          bankAccountNumber: v.bankAccountNumber,
          bankRuc: v.bankRuc,
          depositPercent: v.depositPercent,
          deadlineHours: v.deadlineHours,
          instructionsEs: v.instructionsEs,
          instructionsEn: v.instructionsEn,
          contactEmail: v.contactEmail,
          contactPhone: v.contactPhone,
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
    <section className="space-y-5">
      <div>
        <h2 className="text-lg font-medium text-text-strong">Pago y seña</h2>
        <p className="text-sm text-text-muted">
          Estos datos se envían al ganador por email y aparecen en la pantalla "Subastas ganadas".
          La seña se calcula como un porcentaje del precio final adjudicado.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
        <div className="space-y-2">
          <Label htmlFor="holder">Titular de la cuenta</Label>
          <Input
            id="holder"
            value={v.bankAccountHolder}
            onChange={(e) => update('bankAccountHolder', e.target.value)}
            placeholder="Santa Rosa Automotores S.A."
            maxLength={120}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bank">Banco</Label>
          <Input
            id="bank"
            value={v.bankName}
            onChange={(e) => update('bankName', e.target.value)}
            placeholder="Banco Itaú Paraguay"
            maxLength={120}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="type">Tipo de cuenta</Label>
          <Input
            id="type"
            value={v.bankAccountType}
            onChange={(e) => update('bankAccountType', e.target.value)}
            placeholder="Cuenta corriente USD"
            maxLength={40}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="num">Número de cuenta</Label>
          <Input
            id="num"
            value={v.bankAccountNumber}
            onChange={(e) => update('bankAccountNumber', e.target.value)}
            placeholder="000-000000-0"
            maxLength={60}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ruc">RUC</Label>
          <Input
            id="ruc"
            value={v.bankRuc}
            onChange={(e) => update('bankRuc', e.target.value)}
            placeholder="80012345-6"
            maxLength={40}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 max-w-md">
        <div className="space-y-2">
          <Label htmlFor="pct">Seña (% del precio final)</Label>
          <Input
            id="pct"
            type="number"
            min={1}
            max={100}
            step={1}
            value={Math.round(v.depositPercent * 100)}
            onChange={(e) =>
              update('depositPercent', Math.min(100, Math.max(0, Number(e.target.value))) / 100)
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="hrs">Plazo (horas)</Label>
          <Input
            id="hrs"
            type="number"
            min={1}
            max={168}
            step={1}
            value={v.deadlineHours}
            onChange={(e) =>
              update('deadlineHours', Math.min(168, Math.max(1, Number(e.target.value))))
            }
          />
        </div>
      </div>

      <div className="space-y-2 max-w-2xl">
        <Label htmlFor="instructionsEs">Instrucciones adicionales (ES)</Label>
        <Textarea
          id="instructionsEs"
          value={v.instructionsEs}
          onChange={(e) => update('instructionsEs', e.target.value)}
          placeholder="Indicaciones sobre el envío del comprobante, horarios de atención, etc."
          rows={4}
          maxLength={2000}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
        <div className="space-y-2">
          <Label htmlFor="cemail">Email de contacto</Label>
          <Input
            id="cemail"
            type="email"
            value={v.contactEmail}
            onChange={(e) => update('contactEmail', e.target.value)}
            placeholder="ventas@santarosa.com.py"
            maxLength={254}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cphone">Teléfono de contacto</Label>
          <Input
            id="cphone"
            value={v.contactPhone}
            onChange={(e) => update('contactPhone', e.target.value)}
            placeholder="+595 21 000-0000"
            maxLength={40}
          />
        </div>
      </div>

      <Button onClick={save} disabled={busy}>
        {busy ? t('saving') : t('save')}
      </Button>
    </section>
  );
}
