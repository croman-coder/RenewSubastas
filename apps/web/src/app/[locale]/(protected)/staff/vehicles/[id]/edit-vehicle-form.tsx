'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  AlertTriangle,
  ArrowLeft,
  Archive,
  Car,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Loader2,
  Save,
  Settings2,
  Tag,
  Trash2,
  Undo2,
} from 'lucide-react';
import { fb } from '@/lib/firebase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormField, FormSection } from '@/components/forms/form-section';
import { ImageUploader, type UploadedImage } from '../_components/image-uploader';

const INPUT_CLS =
  'h-11 rounded-xl bg-bg-deep/40 border-text-subtle/20 focus:border-copper/50 focus:ring-copper/30 transition-colors';

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

interface Initial {
  audience: 'retail' | 'wholesale';
  make: string;
  model: string;
  year: number;
  vin?: string;
  licensePlate?: string;
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
  isAdmin: boolean;
  initial: Initial;
}

export function EditVehicleForm({ locale, vehicleId, isAdmin, initial }: Props) {
  const t = useTranslations('staff.vehicles.form');
  const tStatus = useTranslations('staff.vehicles.status');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState(initial.status);
  const [images, setImages] = useState<UploadedImage[]>(initial.images);

  const isLocked = status === 'sold' || status === 'archived';
  const showInAuctionWarning = status === 'in_auction';

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: {
      audience: initial.audience,
      make: initial.make,
      model: initial.model,
      year: initial.year,
      vin: initial.vin,
      licensePlate: initial.licensePlate,
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
  const audience = watch('audience');
  const transmission = watch('transmission');
  const fuelType = watch('fuelType');
  const condition = watch('condition');
  const audienceLocked = status === 'in_auction' || status === 'sold' || status === 'archived';

  async function onSubmit(values: FormValues) {
    if (isLocked) return;
    setSubmitting(true);
    try {
      const ref = doc(fb.db, 'vehicles', vehicleId);
      const payload: Record<string, unknown> = {
        ...(audienceLocked ? {} : { audience: values.audience }),
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
      if (values.licensePlate) {
        payload['licensePlate'] = values.licensePlate.trim().toUpperCase();
      }
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

  // Hard-delete is admin-only and irreversible: it wipes the Firestore doc
  // and the photos in Storage. Locked while in_auction or sold so financial
  // history can never be silently destroyed.
  const canHardDelete =
    isAdmin && (status === 'draft' || status === 'ready' || status === 'archived');

  async function confirmHardDelete() {
    const label = `${initial.make} ${initial.model} ${initial.year}`;
    const typed = window.prompt(
      `Vas a borrar PERMANENTEMENTE el vehículo "${label}" y todas sus fotos.\nEsta acción NO se puede deshacer.\n\nEscribí ELIMINAR para confirmar:`,
    );
    if (typed === null) return;
    if (typed.trim().toUpperCase() !== 'ELIMINAR') {
      toast.error('Confirmación incorrecta. Cancelado.');
      return;
    }
    setSubmitting(true);
    try {
      await httpsCallable(fb.functions, 'deleteVehicle')({ vehicleId });
      toast.success('Vehículo eliminado.');
      router.replace(`/${locale}/staff/vehicles` as `/${string}`);
    } catch (e) {
      toast.error((e as Error).message ?? t('errors.generic'));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-3xl mx-auto pb-24">
      <div className="flex items-center mb-6 animate-in fade-in slide-in-from-top-1 duration-300">
        <a
          href={`/${locale}/staff/vehicles` as `/${string}`}
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-copper transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> {t('backToList')}
        </a>
      </div>
      <header className="mb-6 flex items-start justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-500">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.12em] text-text-muted font-semibold">
            Inventario · Editar
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-strong truncate">
            {initial.make} {initial.model}{' '}
            <span className="text-text-muted font-light num-tab">{initial.year}</span>
          </h1>
        </div>
        <Badge variant="secondary" className="mt-2 shrink-0">
          {tStatus(status)}
        </Badge>
      </header>

      {showInAuctionWarning && (
        <div className="mb-5 rounded-xl border border-amber-500/40 bg-amber-500/[0.06] px-4 py-3 flex items-start gap-3 animate-in fade-in slide-in-from-top-1 duration-300">
          <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" strokeWidth={2.25} />
          <div>
            <p className="text-sm font-medium text-amber-200">Vehículo en subasta activa</p>
            <p className="text-xs text-amber-200/80 mt-1">
              Cualquier cambio que hagas será visible inmediatamente para los buyers que están
              pujando. Editá con cuidado.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-5">
        <FormSection
          icon={Tag}
          title="Audiencia"
          description={
            audienceLocked
              ? 'Una vez que el vehículo entró en subasta, la audiencia queda fija.'
              : 'Decide qué buyers van a ver este vehículo.'
          }
          accent={audience === 'wholesale' ? 'amber' : 'lavender'}
        >
          <FormField label="Tipo">
            <Select
              value={audience}
              onValueChange={(v) => setValue('audience', v as FormValues['audience'])}
              disabled={audienceLocked}
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
        </FormSection>

        <fieldset disabled={isLocked} className="space-y-5 contents">
          <FormSection
            icon={Car}
            title="Identificación"
            description="Datos para reconocer el vehículo en el catálogo."
            accent="copper"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Marca" htmlFor="make" required error={errors.make?.message}>
                <Input id="make" className={INPUT_CLS} {...register('make')} />
              </FormField>
              <FormField label="Modelo" htmlFor="model" required error={errors.model?.message}>
                <Input id="model" className={INPUT_CLS} {...register('model')} />
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
                  className={`${INPUT_CLS} num-tab`}
                  {...register('mileage')}
                />
              </FormField>
              <FormField label="Color" htmlFor="color">
                <Input id="color" className={INPUT_CLS} {...register('color')} />
              </FormField>
              <FormField label="Condición">
                <Select
                  value={condition}
                  onValueChange={(v) => setValue('condition', v as FormValues['condition'])}
                  disabled={isLocked}
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
                  disabled={isLocked}
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
                  disabled={isLocked}
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
        </fieldset>
      </div>

      <div className="sticky bottom-0 mt-8 -mx-4 px-4 py-3 bg-bg-base/95 backdrop-blur-md border-t border-text-subtle/15 sm:mx-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {status === 'draft' && images.length > 0 && (
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={() => setStatusValue('ready')}
              >
                <CheckCircle2 className="w-4 h-4 mr-1.5" /> {t('publishToAuction')}
              </Button>
            )}
            {status === 'ready' && (
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={() => setStatusValue('draft')}
              >
                <Undo2 className="w-4 h-4 mr-1.5" /> {t('backToDraft')}
              </Button>
            )}
            {(status === 'draft' || status === 'ready') && (
              <Button
                type="button"
                variant="ghost"
                disabled={submitting}
                onClick={confirmArchive}
                className="text-text-muted hover:text-rose-400"
              >
                <Archive className="w-4 h-4 mr-1.5" /> Archivar
              </Button>
            )}
            {canHardDelete && (
              <Button
                type="button"
                variant="ghost"
                disabled={submitting}
                onClick={confirmHardDelete}
                className="text-text-muted hover:text-danger"
              >
                <Trash2 className="w-4 h-4 mr-1.5" /> Eliminar definitivamente
              </Button>
            )}
          </div>
          {!isLocked && (
            <Button type="submit" disabled={submitting} className="min-w-[140px] ml-auto">
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
          )}
        </div>
      </div>
    </form>
  );
}
