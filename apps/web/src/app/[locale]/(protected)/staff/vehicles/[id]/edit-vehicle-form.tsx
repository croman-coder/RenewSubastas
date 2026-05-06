'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { fb } from '@/lib/firebase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ImageUploader, type UploadedImage } from '../_components/image-uploader';

const Schema = z.object({
  make: z.string().min(1),
  model: z.string().min(1),
  year: z.coerce.number().int().min(1900).max(2100),
  vin: z.string().optional(),
  mileage: z.coerce.number().nonnegative().optional(),
  transmission: z.enum(['manual', 'automatic', 'cvt']),
  fuelType: z.enum(['gasoline', 'diesel', 'hybrid', 'electric']),
  color: z.string().optional(),
  condition: z.enum(['new', 'used', 'damaged']),
  descriptionEs: z.string().min(1),
  descriptionEn: z.string().optional(),
});
type FormValues = z.infer<typeof Schema>;

interface Initial {
  make: string;
  model: string;
  year: number;
  vin?: string;
  mileage: number | null | undefined;
  transmission: 'manual' | 'automatic' | 'cvt';
  fuelType: 'gasoline' | 'diesel' | 'hybrid' | 'electric';
  color?: string;
  condition: 'new' | 'used' | 'damaged';
  descriptionEs: string;
  descriptionEn?: string;
  status: 'draft' | 'ready' | 'in_auction' | 'sold' | 'archived';
  images: UploadedImage[];
}

interface Props {
  locale: string;
  vehicleId: string;
  initial: Initial;
}

export function EditVehicleForm({ locale, vehicleId, initial }: Props) {
  const t = useTranslations('staff.vehicles.form');
  const tStatus = useTranslations('staff.vehicles.status');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState(initial.status);
  const [images, setImages] = useState<UploadedImage[]>(initial.images);

  const isLocked = status === 'in_auction' || status === 'sold' || status === 'archived';

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: {
      make: initial.make,
      model: initial.model,
      year: initial.year,
      vin: initial.vin,
      ...(initial.mileage !== undefined && initial.mileage !== null
        ? { mileage: initial.mileage }
        : {}),
      transmission: initial.transmission,
      fuelType: initial.fuelType,
      color: initial.color,
      condition: initial.condition,
      descriptionEs: initial.descriptionEs,
      descriptionEn: initial.descriptionEn,
    },
  });
  const transmission = watch('transmission');
  const fuelType = watch('fuelType');
  const condition = watch('condition');

  async function onSubmit(values: FormValues) {
    if (isLocked) return;
    setSubmitting(true);
    try {
      const ref = doc(fb.db, 'vehicles', vehicleId);
      const payload: Record<string, unknown> = {
        make: values.make,
        model: values.model,
        year: values.year,
        transmission: values.transmission,
        fuelType: values.fuelType,
        condition: values.condition,
        description: values.descriptionEn
          ? { es: values.descriptionEs, en: values.descriptionEn }
          : { es: values.descriptionEs },
        images: images.map((img, i) => ({
          url: img.url,
          thumbnailUrl: img.thumbnailUrl,
          order: i,
        })),
        updatedAt: serverTimestamp(),
      };
      if (values.vin) payload['vin'] = values.vin;
      if (values.mileage !== undefined) payload['mileage'] = values.mileage;
      if (values.color) payload['color'] = values.color;
      await updateDoc(ref, payload);
      toast.success(t('saved'));
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message ?? t('errors.generic'));
    } finally {
      setSubmitting(false);
    }
  }

  async function setStatusValue(next: 'draft' | 'ready' | 'archived') {
    setSubmitting(true);
    try {
      const ref = doc(fb.db, 'vehicles', vehicleId);
      await updateDoc(ref, { status: next, updatedAt: serverTimestamp() });
      setStatus(next);
      toast.success(t('saved'));
      if (next === 'archived') {
        router.replace(`/${locale}/staff/vehicles` as `/${string}`);
      } else {
        router.refresh();
      }
    } catch (e) {
      toast.error((e as Error).message ?? t('errors.generic'));
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmArchive() {
    if (!window.confirm('¿Archivar este vehículo? No aparecerá en listados activos.')) return;
    await setStatusValue('archived');
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl space-y-6">
      <a
        href={`/${locale}/staff/vehicles` as `/${string}`}
        className="text-sm text-text-muted hover:text-text-strong"
      >
        {t('backToList')}
      </a>
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text-strong">{t('title')}</h1>
        <Badge variant="secondary">{tStatus(status)}</Badge>
      </header>

      <fieldset disabled={isLocked} className="space-y-6 contents">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="make">{t('make')}</Label>
            <Input id="make" {...register('make')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="model">{t('model')}</Label>
            <Input id="model" {...register('model')} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="year">{t('year')}</Label>
            <Input id="year" type="number" {...register('year')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mileage">{t('mileage')}</Label>
            <Input id="mileage" type="number" {...register('mileage')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="color">{t('color')}</Label>
            <Input id="color" {...register('color')} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="vin">{t('vin')}</Label>
          <Input id="vin" {...register('vin')} />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>{t('transmission')}</Label>
            <Select
              value={transmission}
              onValueChange={(v) => setValue('transmission', v as FormValues['transmission'])}
              disabled={isLocked}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">{t('transmissionManual')}</SelectItem>
                <SelectItem value="automatic">{t('transmissionAutomatic')}</SelectItem>
                <SelectItem value="cvt">{t('transmissionCvt')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t('fuelType')}</Label>
            <Select
              value={fuelType}
              onValueChange={(v) => setValue('fuelType', v as FormValues['fuelType'])}
              disabled={isLocked}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gasoline">{t('fuelGasoline')}</SelectItem>
                <SelectItem value="diesel">{t('fuelDiesel')}</SelectItem>
                <SelectItem value="hybrid">{t('fuelHybrid')}</SelectItem>
                <SelectItem value="electric">{t('fuelElectric')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t('condition')}</Label>
            <Select
              value={condition}
              onValueChange={(v) => setValue('condition', v as FormValues['condition'])}
              disabled={isLocked}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">{t('conditionNew')}</SelectItem>
                <SelectItem value="used">{t('conditionUsed')}</SelectItem>
                <SelectItem value="damaged">{t('conditionDamaged')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="descriptionEs">{t('descriptionEs')}</Label>
          <Textarea id="descriptionEs" rows={4} {...register('descriptionEs')} />
          {errors.descriptionEs && <p className="text-sm text-danger">required</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="descriptionEn">{t('descriptionEn')}</Label>
          <Textarea id="descriptionEn" rows={3} {...register('descriptionEn')} />
        </div>
        <div className="space-y-2">
          <Label>{t('images')}</Label>
          <ImageUploader vehicleId={vehicleId} initial={images} onChange={setImages} />
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-3">
        {!isLocked && (
          <Button type="submit" disabled={submitting}>
            {submitting ? t('saving') : t('save')}
          </Button>
        )}
        {status === 'draft' && images.length > 0 && (
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => setStatusValue('ready')}
          >
            {t('publishToAuction')}
          </Button>
        )}
        {status === 'ready' && (
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => setStatusValue('draft')}
          >
            {t('backToDraft')}
          </Button>
        )}
        {(status === 'draft' || status === 'ready') && (
          <Button
            type="button"
            variant="destructive"
            disabled={submitting}
            onClick={confirmArchive}
            className="ml-auto"
          >
            Archivar
          </Button>
        )}
      </div>
    </form>
  );
}
