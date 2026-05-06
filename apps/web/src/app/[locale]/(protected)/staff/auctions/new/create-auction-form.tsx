'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { httpsCallable } from 'firebase/functions';
import { toast } from 'sonner';
import { fb } from '@/lib/firebase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { ReadyVehicleOption } from '@/lib/staff/list-ready-vehicles';

const Schema = z.object({
  vehicleId: z.string().min(1),
  startingPrice: z.coerce.number().positive(),
  reservePrice: z.coerce.number().positive().optional(),
  bidIncrement: z.coerce.number().positive(),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
});
type FormValues = z.infer<typeof Schema>;

interface Props {
  locale: string;
  vehicles: ReadyVehicleOption[];
}

export function CreateAuctionForm({ locale, vehicles }: Props) {
  const t = useTranslations('staff.auctions.create');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const { register, handleSubmit, setValue, watch } = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: {
      vehicleId: vehicles[0]?.id ?? '',
      startingPrice: 5000,
      bidIncrement: 500,
      startsAt: nowLocalIso(0),
      endsAt: nowLocalIso(7 * 24 * 60),
    },
  });
  const vehicleId = watch('vehicleId');

  if (vehicles.length === 0) {
    return (
      <div className="max-w-xl space-y-4">
        <a
          href={`/${locale}/staff/auctions`}
          className="text-sm text-text-muted hover:text-text-strong"
        >
          ← {t('title')}
        </a>
        <Alert>
          <AlertDescription>{t('noReadyVehicles')}</AlertDescription>
        </Alert>
      </div>
    );
  }

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        vehicleId: values.vehicleId,
        startingPrice: values.startingPrice,
        bidIncrement: values.bidIncrement,
        startsAt: new Date(values.startsAt).toISOString(),
        endsAt: new Date(values.endsAt).toISOString(),
      };
      if (values.reservePrice) payload['reservePrice'] = values.reservePrice;
      const result = await httpsCallable<typeof payload, { auctionId: string }>(
        fb.functions,
        'createAuction',
      )(payload);
      toast.success(t('submit'));
      router.replace(`/${locale}/staff/auctions/${result.data.auctionId}` as `/${string}`);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message ?? t('errors.generic'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-xl space-y-4">
      <a
        href={`/${locale}/staff/auctions`}
        className="text-sm text-text-muted hover:text-text-strong"
      >
        ← {t('title')}
      </a>
      <h1 className="text-2xl font-semibold text-text-strong">{t('title')}</h1>

      <div className="space-y-2">
        <Label>{t('vehicle')}</Label>
        <Select value={vehicleId} onValueChange={(v) => setValue('vehicleId', v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {vehicles.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="startingPrice">{t('startingPrice')}</Label>
          <Input id="startingPrice" type="number" step="1" {...register('startingPrice')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="reservePrice">{t('reservePrice')}</Label>
          <Input id="reservePrice" type="number" step="1" {...register('reservePrice')} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="bidIncrement">{t('bidIncrement')}</Label>
        <Input id="bidIncrement" type="number" step="1" {...register('bidIncrement')} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="startsAt">{t('startsAt')}</Label>
          <Input id="startsAt" type="datetime-local" {...register('startsAt')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="endsAt">{t('endsAt')}</Label>
          <Input id="endsAt" type="datetime-local" {...register('endsAt')} />
        </div>
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
}

// Returns `YYYY-MM-DDTHH:MM` for `<input type="datetime-local">` in local TZ,
// offset by `addMinutes` from now.
function nowLocalIso(addMinutes: number): string {
  const d = new Date(Date.now() + addMinutes * 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
