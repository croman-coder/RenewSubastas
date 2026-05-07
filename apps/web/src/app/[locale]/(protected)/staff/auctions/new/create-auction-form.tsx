'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { httpsCallable } from 'firebase/functions';
import { toast } from 'sonner';
import { ArrowLeft, CalendarRange, Car, DollarSign, Gavel, Loader2 } from 'lucide-react';
import { fb } from '@/lib/firebase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FormField, FormSection } from '@/components/forms/form-section';
import type { ReadyVehicleOption } from '@/lib/staff/list-ready-vehicles';

// Mirrors the cap enforced server-side in createAuction. Surfaces immediate
// validation messages instead of letting users hit a Cloud Functions error.
const MAX_PRICE_USD = 200_000;
const MAX_INCREMENT_USD = 50_000;
const INPUT_CLS =
  'h-11 rounded-xl bg-bg-deep/40 border-text-subtle/20 focus:border-copper/50 focus:ring-copper/30 transition-colors';

const Schema = z
  .object({
    vehicleId: z.string().min(1),
    startingPrice: z.coerce
      .number()
      .positive()
      .max(MAX_PRICE_USD, `El máximo permitido es USD ${MAX_PRICE_USD.toLocaleString()}`),
    reservePrice: z.coerce.number().max(MAX_PRICE_USD).optional(),
    bidIncrement: z.coerce
      .number()
      .positive()
      .max(MAX_INCREMENT_USD, `Incremento máximo USD ${MAX_INCREMENT_USD.toLocaleString()}`),
    startsAt: z.string().min(1),
    endsAt: z.string().min(1),
  })
  .refine(
    (v) =>
      v.reservePrice === undefined ||
      Number.isNaN(v.reservePrice) ||
      v.reservePrice >= v.startingPrice,
    {
      message: 'El precio de reserva debe ser mayor o igual al inicial',
      path: ['reservePrice'],
    },
  )
  .refine((v) => new Date(v.endsAt).getTime() > new Date(v.startsAt).getTime() + 60_000, {
    message: 'La fecha de fin debe ser al menos 1 minuto después del inicio',
    path: ['endsAt'],
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

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
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
      <div className="max-w-xl mx-auto space-y-4">
        <a
          href={`/${locale}/staff/auctions`}
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-copper transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> {t('title')}
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
      if (
        values.reservePrice !== undefined &&
        !Number.isNaN(values.reservePrice) &&
        values.reservePrice > 0
      ) {
        payload['reservePrice'] = values.reservePrice;
      }
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
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-3xl mx-auto pb-24">
      <div className="flex items-center mb-6 animate-in fade-in slide-in-from-top-1 duration-300">
        <a
          href={`/${locale}/staff/auctions`}
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-copper transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Volver a subastas
        </a>
      </div>
      <header className="mb-6 animate-in fade-in slide-in-from-top-2 duration-500">
        <p className="text-[11px] uppercase tracking-[0.12em] text-text-muted font-semibold">
          Subastas · Nueva
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-strong">{t('title')}</h1>
        <p className="mt-1 text-sm text-text-muted">
          Configurá precio, incrementos y ventana. La audiencia se hereda del vehículo elegido.
        </p>
      </header>

      <div className="space-y-5">
        <FormSection
          icon={Car}
          title="Vehículo"
          description="Solo aparecen los vehículos en estado 'Listo'."
          accent="copper"
        >
          <FormField label="Elegir vehículo">
            <Select value={vehicleId} onValueChange={(v) => setValue('vehicleId', v)}>
              <SelectTrigger className={INPUT_CLS}>
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
          </FormField>
        </FormSection>

        <FormSection
          icon={DollarSign}
          title="Precios"
          description="USD. Reserva opcional — si la usás, debe ser mayor o igual al inicial."
          accent="mint"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              label="Precio inicial"
              htmlFor="startingPrice"
              required
              error={errors.startingPrice?.message}
              hint={`Máximo USD ${MAX_PRICE_USD.toLocaleString()}`}
            >
              <Input
                id="startingPrice"
                type="number"
                step="1"
                className={`${INPUT_CLS} num-tab`}
                {...register('startingPrice')}
              />
            </FormField>
            <FormField
              label="Precio de reserva"
              htmlFor="reservePrice"
              error={errors.reservePrice?.message}
              hint="Opcional · dejá vacío si no usás reserva"
            >
              <Input
                id="reservePrice"
                type="number"
                step="1"
                className={`${INPUT_CLS} num-tab`}
                {...register('reservePrice')}
              />
            </FormField>
          </div>
          <FormField
            label="Incremento mínimo"
            htmlFor="bidIncrement"
            required
            error={errors.bidIncrement?.message}
            hint="Cuánto sube cada puja. Default 500."
          >
            <Input
              id="bidIncrement"
              type="number"
              step="1"
              className={`${INPUT_CLS} num-tab`}
              {...register('bidIncrement')}
            />
          </FormField>
        </FormSection>

        <FormSection
          icon={CalendarRange}
          title="Ventana de subasta"
          description="Cuándo abre y cierra. Anti-sniping de 60s extiende el cierre si entra una puja."
          accent="amber"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Inicio" htmlFor="startsAt" required>
              <Input
                id="startsAt"
                type="datetime-local"
                className={`${INPUT_CLS} num-tab`}
                {...register('startsAt')}
              />
            </FormField>
            <FormField label="Fin" htmlFor="endsAt" required error={errors.endsAt?.message}>
              <Input
                id="endsAt"
                type="datetime-local"
                className={`${INPUT_CLS} num-tab`}
                {...register('endsAt')}
              />
            </FormField>
          </div>
        </FormSection>
      </div>

      <div className="sticky bottom-0 mt-8 -mx-4 px-4 py-3 bg-bg-base/95 backdrop-blur-md border-t border-text-subtle/15 sm:mx-0">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-text-muted hidden sm:block">
            Al crear, el vehículo pasa a estado{' '}
            <span className="text-text-strong font-medium">en subasta</span>.
          </p>
          <div className="flex items-center gap-2 ml-auto">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.replace(`/${locale}/staff/auctions` as `/${string}`)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting} className="min-w-[160px]">
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> {t('submitting')}
                </>
              ) : (
                <>
                  <Gavel className="w-4 h-4 mr-1.5" /> {t('submit')}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
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
