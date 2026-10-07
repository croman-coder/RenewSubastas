'use client';
import { useMemo, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
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
import { PhoneInput } from '@/components/forms/phone-input';
import { AddressCascade } from '@/components/forms/address-cascade';
import { phoneDigits } from '@/lib/admin/contact-links';
import { updateProfileAction } from '@/lib/settings/update-profile';

// Document number validation depends on type:
//   CI       -> Paraguayan cédula, numeric, up to 7 digits
//   RUC      -> Paraguayan RUC, numeric, 7-12 chars (the dash is optional)
//   PASSPORT -> alphanumeric, 5–15 chars (covers most foreign passports)
const buildSchema = (requirePhone: boolean) =>
  z
    .object({
      // Real human names rarely exceed 40 chars even with multiple given names
      // or compound surnames. The cap also prevents the "Carlos00000000…" abuse
      // pattern where a user pastes garbage to break dashboard layouts.
      firstName: z
        .string()
        .min(1, 'Requerido')
        .max(40, 'Máximo 40 caracteres')
        .regex(/^[\p{L}\p{M}'’\- .]+$/u, 'Solo letras, espacios, apóstrofes y guiones'),
      lastName: z
        .string()
        .min(1, 'Requerido')
        .max(40, 'Máximo 40 caracteres')
        .regex(/^[\p{L}\p{M}'’\- .]+$/u, 'Solo letras, espacios, apóstrofes y guiones'),
      documentType: z.enum(['CI', 'RUC', 'PASSPORT']),
      documentNumber: z.string().min(1, 'Requerido').max(15),
      phone: z.string().max(20).optional(),
      addressStreet: z
        .string()
        .max(130, 'La dirección no puede tener más de 130 caracteres')
        .optional(),
      addressDepartment: z.string().max(80).optional(),
      addressCity: z.string().max(80).optional(),
      addressBarrio: z.string().max(80).optional(),
      addressPostalCode: z
        .string()
        .regex(/^\d{4}$|^$/, 'Código postal: 4 dígitos')
        .optional(),
    })
    .superRefine((v, ctx) => {
      // Llegar desde el aviso "completá tu perfil para pujar" (?completar=1): el
      // servidor rechaza pujar sin un teléfono válido (placeBid.ts: 8+ dígitos, y 12 si es 595),
      // así que acá se exige también, con el mismo umbral. Fuera de ese flujo
      // sigue siendo opcional: lo usan también staff y admin.
      if (requirePhone && phoneDigits(v.phone) === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['phone'],
          message: 'Cargá un teléfono completo para poder pujar (Paraguay: 9 dígitos)',
        });
      }
      if (v.documentType === 'CI' && !/^\d{1,7}$/.test(v.documentNumber)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['documentNumber'],
          message: 'CI: hasta 7 dígitos numéricos',
        });
      }
      if (v.documentType === 'RUC' && !/^\d{7,12}-?\d?$/.test(v.documentNumber)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['documentNumber'],
          message: 'RUC inválido',
        });
      }
      if (v.documentType === 'PASSPORT' && !/^[A-Za-z0-9]{5,15}$/.test(v.documentNumber)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['documentNumber'],
          message: 'Pasaporte: 5–15 caracteres alfanuméricos',
        });
      }
    });
type FormValues = z.infer<ReturnType<typeof buildSchema>>;

interface Initial {
  email: string;
  firstName: string;
  lastName: string;
  documentType: 'CI' | 'RUC' | 'PASSPORT';
  documentNumber: string;
  phone: string;
  addressStreet: string;
  addressDepartment: string;
  addressCity: string;
  addressBarrio: string;
  addressPostalCode: string;
}

export function ProfileForm({
  initial,
  isBuyer = false,
  completar = false,
  returnTo = null,
}: {
  initial: Initial;
  /** Muestra la ayuda del teléfono: a los compradores se les pide para pujar. */
  isBuyer?: boolean;
  /** Viene de ?completar=1 (aviso de perfil incompleto al pujar): documento y teléfono obligatorios. */
  completar?: boolean;
  /** Ruta de la subasta de la que se vino (ya validada en el servidor), para volver tras guardar. */
  returnTo?: string | null;
}) {
  const t = useTranslations('settings.profile');
  const schema = useMemo(() => buildSchema(completar), [completar]);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: initial.firstName,
      lastName: initial.lastName,
      documentType: initial.documentType,
      documentNumber: initial.documentNumber,
      phone: initial.phone,
      addressStreet: initial.addressStreet,
      addressDepartment: initial.addressDepartment,
      addressCity: initial.addressCity,
      addressBarrio: initial.addressBarrio,
      addressPostalCode: initial.addressPostalCode,
    },
  });
  const docType = watch('documentType');

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    const res = await updateProfileAction(values);
    setSubmitting(false);
    if (res.ok) {
      toast.success(t('saved'));
      setSaved(true);
      return;
    }
    if (res.error === 'documentInvalid') toast.error(t('errors.documentInvalid'));
    else toast.error(t('errors.generic'));
  }

  const docPlaceholder =
    docType === 'CI' ? 'Hasta 7 dígitos' : docType === 'RUC' ? 'Ej: 12345678-9' : 'Ej: AB1234567';

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-6 max-w-2xl"
      // Disable Chrome's "save this address?" autofill prompt — that dialog is
      // browser-rendered and isn't aware our address is already persisted on
      // submit. Per-field autoComplete strings below keep targeted suggestions
      // (postal code, country) without offering to "save the whole address".
      autoComplete="off"
    >
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-text-strong">{t('title')}</h1>
        <p className="text-sm text-text-muted">{t('subtitle')}</p>
      </header>

      {completar && (
        <p
          role="status"
          className="rounded-xl border border-text-subtle/20 bg-bg-elev px-4 py-3 text-sm text-text-strong"
        >
          Para pujar necesitamos tu documento y tu teléfono. Completá los campos marcados con * y
          guardá.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="firstName">{t('firstName')}</Label>
          <Input
            id="firstName"
            maxLength={40}
            autoComplete="given-name"
            {...register('firstName')}
          />
          {errors.firstName && <p className="text-sm text-danger">{errors.firstName.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">{t('lastName')}</Label>
          <Input
            id="lastName"
            maxLength={40}
            autoComplete="family-name"
            {...register('lastName')}
          />
          {errors.lastName && <p className="text-sm text-danger">{errors.lastName.message}</p>}
        </div>
      </div>

      <div className="space-y-2">
        <Label>{t('email')}</Label>
        <Input value={initial.email} readOnly disabled />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-4">
        <div className="space-y-2">
          <Label>{t('documentType')}</Label>
          <Select
            value={docType}
            onValueChange={(v) => setValue('documentType', v as FormValues['documentType'])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CI">Cédula (CI)</SelectItem>
              <SelectItem value="RUC">RUC</SelectItem>
              <SelectItem value="PASSPORT">Pasaporte</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="documentNumber">
            {t('documentNumber')}
            {completar && <RequiredMark />}
          </Label>
          <Input
            id="documentNumber"
            placeholder={docPlaceholder}
            inputMode={docType === 'PASSPORT' ? 'text' : 'numeric'}
            maxLength={docType === 'CI' ? 7 : 15}
            {...register('documentNumber')}
          />
          {errors.documentNumber && (
            <p className="text-sm text-danger">{errors.documentNumber.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">
          {t('phone')}
          {completar && <RequiredMark />}
        </Label>
        <Controller
          control={control}
          name="phone"
          render={({ field }) => (
            <PhoneInput id="phone" value={field.value ?? ''} onChange={field.onChange} />
          )}
        />
        <p className="text-xs text-text-muted">
          Elegí tu país y escribí tu número sin el prefijo. Para Paraguay: 9 dígitos (ej. 981 123
          456).
        </p>
        {isBuyer && (
          <p className="text-xs text-text-muted">
            Lo necesitás para pujar y para que te contactemos si ganás.
          </p>
        )}
        {errors.phone && <p className="text-sm text-danger">{errors.phone.message}</p>}
      </div>

      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-text-strong tracking-tight">Dirección</legend>

        <Controller
          control={control}
          name="addressDepartment"
          render={({ field: depField }) => (
            <Controller
              control={control}
              name="addressCity"
              render={({ field: cityField }) => (
                <Controller
                  control={control}
                  name="addressBarrio"
                  render={({ field: barrioField }) => (
                    <AddressCascade
                      value={{
                        department: depField.value ?? '',
                        city: cityField.value ?? '',
                        barrio: barrioField.value ?? '',
                      }}
                      onChange={(next) => {
                        depField.onChange(next.department);
                        cityField.onChange(next.city);
                        barrioField.onChange(next.barrio);
                      }}
                    />
                  )}
                />
              )}
            />
          )}
        />

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-4">
          <div className="space-y-2">
            <Label htmlFor="addressStreet">Dirección (calle y número)</Label>
            <Input
              id="addressStreet"
              maxLength={130}
              placeholder="Ej. Av. Mariscal López 1234"
              {...register('addressStreet')}
            />
            {errors.addressStreet && (
              <p className="text-sm text-danger">{errors.addressStreet.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="addressPostalCode">Código postal</Label>
            <Input
              id="addressPostalCode"
              type="text"
              inputMode="numeric"
              maxLength={4}
              placeholder="1234"
              {...register('addressPostalCode', {
                setValueAs: (v) => (typeof v === 'string' ? v.replace(/\D/g, '').slice(0, 4) : v),
              })}
            />
            {errors.addressPostalCode && (
              <p className="text-sm text-danger">{errors.addressPostalCode.message}</p>
            )}
          </div>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? t('saving') : t('save')}
        </Button>
        {saved && returnTo && (
          <Button asChild variant="outline">
            <a href={returnTo}>Volver a la subasta</a>
          </Button>
        )}
      </div>
    </form>
  );
}

/** Asterisco de campo obligatorio; el texto accesible lo dice con palabras. */
function RequiredMark() {
  return (
    <span className="ml-1 text-danger" title="Obligatorio">
      <span aria-hidden="true">*</span>
      <span className="sr-only"> (obligatorio)</span>
    </span>
  );
}
