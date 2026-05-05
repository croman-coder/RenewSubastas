'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
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
import { updateProfileAction } from '@/lib/settings/update-profile';

const Schema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  documentType: z.enum(['CI', 'RUC']),
  documentNumber: z.string().min(1),
  phone: z.string().optional(),
  addressStreet: z.string().optional(),
  addressCity: z.string().optional(),
  addressPostalCode: z.string().optional(),
});
type FormValues = z.infer<typeof Schema>;

// All optional string fields are typed as string (never undefined) so that
// exactOptionalPropertyTypes does not error when passed as defaultValues.
interface Initial {
  email: string;
  firstName: string;
  lastName: string;
  documentType: 'CI' | 'RUC';
  documentNumber: string;
  phone: string;
  addressStreet: string;
  addressCity: string;
  addressPostalCode: string;
}

export function ProfileForm({ initial }: { initial: Initial }) {
  const t = useTranslations('settings.profile');
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: {
      firstName: initial.firstName,
      lastName: initial.lastName,
      documentType: initial.documentType,
      documentNumber: initial.documentNumber,
      phone: initial.phone,
      addressStreet: initial.addressStreet,
      addressCity: initial.addressCity,
      addressPostalCode: initial.addressPostalCode,
    },
  });
  const docType = watch('documentType');

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    const res = await updateProfileAction(values);
    setSubmitting(false);
    if (res.ok) toast.success(t('saved'));
    else if (res.error === 'documentInvalid') toast.error(t('errors.documentInvalid'));
    else toast.error(t('errors.generic'));
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-xl">
      <header>
        <h1 className="text-2xl font-semibold text-text-strong">{t('title')}</h1>
        <p className="text-sm text-text-muted">{t('subtitle')}</p>
      </header>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="firstName">{t('firstName')}</Label>
          <Input id="firstName" {...register('firstName')} />
          {errors.firstName && <p className="text-sm text-danger">{errors.firstName.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">{t('lastName')}</Label>
          <Input id="lastName" {...register('lastName')} />
          {errors.lastName && <p className="text-sm text-danger">{errors.lastName.message}</p>}
        </div>
      </div>
      <div className="space-y-2">
        <Label>{t('email')}</Label>
        <Input value={initial.email} readOnly disabled />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t('documentType')}</Label>
          <Select
            value={docType}
            onValueChange={(v) => setValue('documentType', v as 'CI' | 'RUC')}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CI">{t('documentTypeCi')}</SelectItem>
              <SelectItem value="RUC">{t('documentTypeRuc')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="documentNumber">{t('documentNumber')}</Label>
          <Input
            id="documentNumber"
            placeholder={
              docType === 'CI'
                ? t('documentNumberPlaceholderCi')
                : t('documentNumberPlaceholderRuc')
            }
            {...register('documentNumber')}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">{t('phone')}</Label>
        <Input id="phone" type="tel" {...register('phone')} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="addressStreet">{t('addressStreet')}</Label>
        <Input id="addressStreet" {...register('addressStreet')} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="addressCity">{t('addressCity')}</Label>
          <Input id="addressCity" {...register('addressCity')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="addressPostalCode">{t('addressPostalCode')}</Label>
          <Input id="addressPostalCode" {...register('addressPostalCode')} />
        </div>
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? t('saving') : t('save')}
      </Button>
    </form>
  );
}
