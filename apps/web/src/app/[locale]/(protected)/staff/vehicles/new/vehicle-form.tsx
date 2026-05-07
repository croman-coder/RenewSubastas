'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  ArrowLeft,
  Car,
  FileText,
  Image as ImageIcon,
  Loader2,
  Save,
  Settings2,
  Tag,
} from 'lucide-react';
import { fb } from '@/lib/firebase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormField, FormSection } from '@/components/forms/form-section';
import { ImageUploader, type UploadedImage } from '../_components/image-uploader';

const Schema = z.object({
  audience: z.enum(['retail', 'wholesale']),
  make: z.string().min(1, 'Requerido'),
  model: z.string().min(1, 'Requerido'),
  year: z.coerce.number().int().min(1900).max(2100),
  vin: z.string().optional(),
  licensePlate: z.string().max(12).optional(),
  mileage: z.coerce.number().nonnegative().optional(),
  transmission: z.enum(['manual', 'automatic', 'cvt']),
  fuelType: z.enum(['gasoline', 'diesel', 'hybrid', 'electric']),
  color: z.string().optional(),
  condition: z.enum(['new', 'used', 'damaged']),
  descriptionEs: z.string().min(1, 'Requerido'),
  descriptionEn: z.string().optional(),
});
type FormValues = z.infer<typeof Schema>;

interface Props {
  locale: string;
  actorUid: string;
}

const INPUT_CLS =
  'h-11 rounded-xl bg-bg-deep/40 border-text-subtle/20 focus:border-copper/50 focus:ring-copper/30 transition-colors';

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
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-3xl mx-auto pb-24">
      <div className="flex items-center justify-between gap-3 mb-6 animate-in fade-in slide-in-from-top-1 duration-300">
        <a
          href={`/${locale}/staff/vehicles`}
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-copper transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> {t('backToList')}
        </a>
      </div>
      <header className="mb-6 animate-in fade-in slide-in-from-top-2 duration-500">
        <p className="text-[11px] uppercase tracking-[0.12em] text-text-muted font-semibold">
          Inventario · Nuevo
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-strong">{t('title')}</h1>
        <p className="mt-1 text-sm text-text-muted">
          Cargá los datos del vehículo. Se guarda como borrador y podés publicarlo después.
        </p>
      </header>

      <div className="space-y-5">
        <FormSection
          icon={Tag}
          title="Audiencia"
          description="Decide qué buyers van a ver este vehículo cuando salga a subasta."
          accent={audience === 'wholesale' ? 'amber' : 'lavender'}
        >
          <FormField label="Tipo">
            <Select
              value={audience}
              onValueChange={(v) => setValue('audience', v as FormValues['audience'])}
            >
              <SelectTrigger className={INPUT_CLS}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="retail">Retail · Público general</SelectItem>
                <SelectItem value="wholesale">Wholesale · Sólo mayoristas</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <p className="text-xs text-text-muted">
            {audience === 'retail'
              ? 'Visible en el catálogo público para todos los buyers retail.'
              : 'Visible únicamente para usuarios con rol Wholesale.'}
          </p>
        </FormSection>

        <FormSection
          icon={Car}
          title="Identificación"
          description="Datos para reconocer el vehículo en el catálogo."
          accent="copper"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Marca" htmlFor="make" required error={errors.make?.message}>
              <Input
                id="make"
                placeholder="Ej. Toyota"
                className={INPUT_CLS}
                {...register('make')}
              />
            </FormField>
            <FormField label="Modelo" htmlFor="model" required error={errors.model?.message}>
              <Input
                id="model"
                placeholder="Ej. Corolla"
                className={INPUT_CLS}
                {...register('model')}
              />
            </FormField>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormField label="Año" htmlFor="year" required>
              <Input
                id="year"
                type="number"
                className={`${INPUT_CLS} num-tab`}
                {...register('year')}
              />
            </FormField>
            <FormField label="Número de chapa" htmlFor="licensePlate" hint="Hasta 12 caracteres">
              <Input
                id="licensePlate"
                placeholder="ABCD123"
                maxLength={12}
                className={`${INPUT_CLS} num-tab uppercase`}
                {...register('licensePlate')}
              />
            </FormField>
            <FormField label="VIN" htmlFor="vin" hint="Opcional">
              <Input id="vin" className={`${INPUT_CLS} num-tab uppercase`} {...register('vin')} />
            </FormField>
          </div>
        </FormSection>

        <FormSection
          icon={Settings2}
          title="Especificaciones"
          description="Detalles técnicos que ayudan al buyer a decidir."
          accent="mint"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormField label="Kilometraje" htmlFor="mileage" hint="km">
              <Input
                id="mileage"
                type="number"
                placeholder="0"
                className={`${INPUT_CLS} num-tab`}
                {...register('mileage')}
              />
            </FormField>
            <FormField label="Color" htmlFor="color">
              <Input
                id="color"
                placeholder="Ej. Negro"
                className={INPUT_CLS}
                {...register('color')}
              />
            </FormField>
            <FormField label="Condición">
              <Select
                value={condition}
                onValueChange={(v) => setValue('condition', v as FormValues['condition'])}
              >
                <SelectTrigger className={INPUT_CLS}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">{t('conditionNew')}</SelectItem>
                  <SelectItem value="used">{t('conditionUsed')}</SelectItem>
                  <SelectItem value="damaged">{t('conditionDamaged')}</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Transmisión">
              <Select
                value={transmission}
                onValueChange={(v) => setValue('transmission', v as FormValues['transmission'])}
              >
                <SelectTrigger className={INPUT_CLS}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">{t('transmissionManual')}</SelectItem>
                  <SelectItem value="automatic">{t('transmissionAutomatic')}</SelectItem>
                  <SelectItem value="cvt">{t('transmissionCvt')}</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Combustible">
              <Select
                value={fuelType}
                onValueChange={(v) => setValue('fuelType', v as FormValues['fuelType'])}
              >
                <SelectTrigger className={INPUT_CLS}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gasoline">{t('fuelGasoline')}</SelectItem>
                  <SelectItem value="diesel">{t('fuelDiesel')}</SelectItem>
                  <SelectItem value="hybrid">{t('fuelHybrid')}</SelectItem>
                  <SelectItem value="electric">{t('fuelElectric')}</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          </div>
        </FormSection>

        <FormSection
          icon={FileText}
          title="Descripción"
          description="Lo que el buyer va a leer en la página del vehículo."
          accent="amber"
        >
          <FormField
            label="Descripción (Español)"
            htmlFor="descriptionEs"
            required
            error={errors.descriptionEs?.message}
          >
            <Textarea
              id="descriptionEs"
              rows={5}
              placeholder="Detalles, historia, equipamiento extra…"
              className="rounded-xl bg-bg-deep/40 border-text-subtle/20 focus:border-copper/50 focus:ring-copper/30 transition-colors"
              {...register('descriptionEs')}
            />
          </FormField>
          <FormField
            label="Descripción (Inglés)"
            htmlFor="descriptionEn"
            hint="Opcional · útil si esperás interés del exterior"
          >
            <Textarea
              id="descriptionEn"
              rows={3}
              placeholder="Optional English description…"
              className="rounded-xl bg-bg-deep/40 border-text-subtle/20 focus:border-copper/50 focus:ring-copper/30 transition-colors"
              {...register('descriptionEn')}
            />
          </FormField>
        </FormSection>

        <FormSection
          icon={ImageIcon}
          title="Fotos"
          description="Hasta 20 imágenes. Arrastrá para reordenar; la primera es la principal."
          accent="copper"
        >
          <ImageUploader vehicleId={vehicleId} initial={images} onChange={setImages} />
        </FormSection>
      </div>

      <div className="sticky bottom-0 mt-8 -mx-4 px-4 py-3 bg-bg-base/95 backdrop-blur-md border-t border-text-subtle/15 sm:mx-0">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-text-muted hidden sm:block">
            Se guarda como <span className="text-text-strong font-medium">borrador</span>. Podés
            publicarlo después desde la lista.
          </p>
          <div className="flex items-center gap-2 ml-auto">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.replace(`/${locale}/staff/vehicles` as `/${string}`)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting} className="min-w-[140px]">
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> {t('saving')}
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-1.5" /> {t('save')}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
