'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { fb } from '@/lib/firebase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ImageUploader, type UploadedImage } from '../_components/image-uploader';

const Schema = z.object({
  audience: z.enum(['retail', 'wholesale']),
  make: z.string().min(1),
  model: z.string().min(1),
  year: z.coerce.number().int().min(1900).max(2100),
  vin: z.string().optional(),
  // Paraguayan plates are typically AABB-CCC, ABC-D-1234, etc. We don't enforce
  // a strict format because regional plates vary; max 12 chars covers them all.
  licensePlate: z.string().max(12).optional(),
  mileage: z.coerce.number().nonnegative().optional(),
  transmission: z.enum(['manual', 'automatic', 'cvt']),
  fuelType: z.enum(['gasoline', 'diesel', 'hybrid', 'electric']),
  color: z.string().optional(),
  condition: z.enum(['new', 'used', 'damaged']),
  descriptionEs: z.string().min(1),
  descriptionEn: z.string().optional(),
});
type FormValues = z.infer<typeof Schema>;

interface Props {
  locale: string;
  actorUid: string;
}

export function VehicleForm({ locale, actorUid }: Props) {
  const t = useTranslations('staff.vehicles.form');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [vehicleId] = useState(() => doc(collection(fb.db, 'vehicles')).id);
  const [images, setImages] = useState<UploadedImage[]>([]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: {
      audience: 'retail',
      make: '',
      model: '',
      year: new Date().getFullYear(),
      vin: '',
      transmission: 'manual',
      fuelType: 'gasoline',
      color: '',
      condition: 'used',
      descriptionEs: '',
      descriptionEn: '',
    },
  });
  const audience = watch('audience');
  const transmission = watch('transmission');
  const fuelType = watch('fuelType');
  const condition = watch('condition');

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      const ref = doc(fb.db, 'vehicles', vehicleId);
      const payload: Record<string, unknown> = {
        id: vehicleId,
        audience: values.audience,
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
        status: 'draft',
        createdBy: actorUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (values.vin) payload['vin'] = values.vin;
      if (values.licensePlate) {
        payload['licensePlate'] = values.licensePlate.trim().toUpperCase();
      }
      if (values.mileage !== undefined) payload['mileage'] = values.mileage;
      if (values.color) payload['color'] = values.color;
      await setDoc(ref, payload);
      toast.success(t('saved'));
      router.replace(`/${locale}/staff/vehicles/${vehicleId}` as `/${string}`);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message ?? t('errors.generic'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl space-y-6">
      <a
        href={`/${locale}/staff/vehicles`}
        className="text-sm text-text-muted hover:text-text-strong"
      >
        {t('backToList')}
      </a>
      <h1 className="text-2xl font-semibold text-text-strong">{t('title')}</h1>

      <div className="space-y-2 rounded-lg border border-text-subtle/15 bg-bg-elev/40 p-4">
        <Label>Audiencia</Label>
        <Select
          value={audience}
          onValueChange={(v) => setValue('audience', v as FormValues['audience'])}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="retail">Retail · Público general</SelectItem>
            <SelectItem value="wholesale">Wholesale · Sólo mayoristas</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-text-muted">
          {audience === 'retail'
            ? 'Visible en el catálogo público para todos los buyers retail.'
            : 'Visible únicamente para usuarios con rol Wholesale.'}
        </p>
      </div>

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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="licensePlate">Número de chapa</Label>
          <Input
            id="licensePlate"
            placeholder="Ej. ABCD123"
            maxLength={12}
            className="num-tab uppercase"
            {...register('licensePlate')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="vin">{t('vin')}</Label>
          <Input id="vin" {...register('vin')} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>{t('transmission')}</Label>
          <Select
            value={transmission}
            onValueChange={(v) => setValue('transmission', v as FormValues['transmission'])}
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
      <Button type="submit" disabled={submitting}>
        {submitting ? t('saving') : t('save')}
      </Button>
    </form>
  );
}
