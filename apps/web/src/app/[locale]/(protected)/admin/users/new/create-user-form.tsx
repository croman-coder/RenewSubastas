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

// "kind" is the operator-facing concept: Admin / Staff / Retail / Wholesale.
// Internally we still split into role + audience because that's how Firebase
// custom claims and Firestore rules are structured.
const Schema = z.object({
  kind: z.enum(['admin', 'staff', 'retail', 'wholesale']),
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  documentType: z.enum(['CI', 'RUC']),
  documentNumber: z.string().min(1),
  phone: z.string().optional(),
});
type FormValues = z.infer<typeof Schema>;

interface CreateUserPayload {
  role: 'admin' | 'staff' | 'buyer';
  email: string;
  firstName: string;
  lastName: string;
  documentType: 'CI' | 'RUC';
  documentNumber: string;
  phone?: string;
  audience?: 'retail' | 'wholesale';
}

function payloadFromKind(values: FormValues): CreateUserPayload {
  if (values.kind === 'admin' || values.kind === 'staff') {
    const base: CreateUserPayload = {
      role: values.kind,
      email: values.email,
      firstName: values.firstName,
      lastName: values.lastName,
      documentType: values.documentType,
      documentNumber: values.documentNumber,
    };
    if (values.phone) base.phone = values.phone;
    return base;
  }
  const base: CreateUserPayload = {
    role: 'buyer',
    email: values.email,
    firstName: values.firstName,
    lastName: values.lastName,
    documentType: values.documentType,
    documentNumber: values.documentNumber,
    audience: values.kind,
  };
  if (values.phone) base.phone = values.phone;
  return base;
}

export function CreateUserForm({ locale }: { locale: string }) {
  const t = useTranslations('admin.users.create');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: {
      kind: 'retail',
      email: '',
      firstName: '',
      lastName: '',
      documentType: 'CI',
      documentNumber: '',
      phone: '',
    },
  });
  const kind = watch('kind');
  const docType = watch('documentType');

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    setResetLink(null);
    try {
      const payload = payloadFromKind(values);
      const result = await httpsCallable<CreateUserPayload, { uid: string; resetLink: string }>(
        fb.functions,
        'createUser',
      )(payload);
      setResetLink(result.data.resetLink);
      toast.success(t('success'));
    } catch (e) {
      const msg = (e as Error).message ?? '';
      if (msg.includes('CI') || msg.includes('RUC')) toast.error(t('errors.documentInvalid'));
      else if (msg.includes('domain')) toast.error(t('errors.emailDomain'));
      else if (msg.includes('already-exists') || msg.includes('email-already')) {
        toast.error(t('errors.duplicate'));
      } else {
        toast.error(t('errors.generic'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {hasErrors && (
        <Alert variant="destructive">
          <AlertDescription>
            Revisa los campos marcados: {Object.keys(errors).join(', ')}
          </AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label>{t('role')}</Label>
        <Select value={kind} onValueChange={(v) => setValue('kind', v as FormValues['kind'])}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="retail">Retail (público general)</SelectItem>
            <SelectItem value="wholesale">Wholesale (mayorista)</SelectItem>
            <SelectItem value="staff">Staff</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-text-muted">
          {kind === 'retail' && 'Ve el catálogo público.'}
          {kind === 'wholesale' && 'Ve únicamente subastas marcadas como mayoristas.'}
          {kind === 'staff' && 'Carga vehículos y subastas. Email @santarosa.com.py.'}
          {kind === 'admin' && 'Acceso total a la plataforma. Email @santarosa.com.py.'}
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">{t('email')}</Label>
        <Input id="email" type="email" autoComplete="off" {...register('email')} />
        {errors.email && <p className="text-sm text-danger">Email inválido</p>}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="firstName">{t('firstName')}</Label>
          <Input id="firstName" {...register('firstName')} />
          {errors.firstName && <p className="text-sm text-danger">Requerido</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">{t('lastName')}</Label>
          <Input id="lastName" {...register('lastName')} />
          {errors.lastName && <p className="text-sm text-danger">Requerido</p>}
        </div>
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
              <SelectItem value="CI">CI</SelectItem>
              <SelectItem value="RUC">RUC</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="documentNumber">{t('documentNumber')}</Label>
          <Input id="documentNumber" {...register('documentNumber')} />
          {errors.documentNumber && <p className="text-sm text-danger">Requerido</p>}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">{t('phone')}</Label>
        <Input id="phone" type="tel" {...register('phone')} />
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? t('submitting') : t('submit')}
      </Button>
      {resetLink && (
        <Alert>
          <AlertDescription className="space-y-3">
            <p className="text-sm">{t('success')}</p>
            <code className="block text-xs bg-bg-deep p-2 rounded break-all">{resetLink}</code>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  navigator.clipboard.writeText(resetLink).then(() => toast.success(t('copy')))
                }
              >
                {t('copy')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => router.push(`/${locale}/admin/users` as `/${string}`)}
              >
                {t('backToList')}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
    </form>
  );
}
