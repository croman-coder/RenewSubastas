'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { httpsCallable } from 'firebase/functions';
import { toast } from 'sonner';
import {
  Check,
  ClipboardCopy,
  IdCard,
  KeyRound,
  Loader2,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
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
import { FormField, FormSection } from '@/components/forms/form-section';

const INPUT_CLS =
  'h-11 rounded-xl bg-bg-deep/40 border-text-subtle/20 focus:border-copper/50 focus:ring-copper/30 transition-colors';

// "kind" is the operator-facing concept: Admin / Staff / Retail / Wholesale.
// Names are capped at 40 chars and restricted to letters/spaces/apostrophes/
// hyphens — matches the buyer's self-edit profile validator.
const NAME_RX = /^[\p{L}\p{M}'’\- .]+$/u;
const Schema = z.object({
  kind: z.enum(['admin', 'staff', 'retail', 'wholesale']),
  email: z.string().email('Email inválido').max(120),
  firstName: z
    .string()
    .min(1, 'Requerido')
    .max(40, 'Máximo 40 caracteres')
    .regex(NAME_RX, 'Solo letras, espacios, apóstrofes y guiones'),
  lastName: z
    .string()
    .min(1, 'Requerido')
    .max(40, 'Máximo 40 caracteres')
    .regex(NAME_RX, 'Solo letras, espacios, apóstrofes y guiones'),
  documentType: z.enum(['CI', 'RUC']),
  documentNumber: z.string().min(1, 'Requerido').max(15),
  phone: z.string().max(20).optional(),
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

const KIND_HINT: Record<FormValues['kind'], string> = {
  retail: 'Ve el catálogo público y puede pujar en subastas retail.',
  wholesale: 'Ve solo el catálogo wholesale, separado del público general.',
  staff: 'Carga vehículos y subastas. Email obligatorio @santarosa.com.py.',
  admin: 'Acceso total a la plataforma. Email obligatorio @santarosa.com.py.',
};

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

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-3xl mx-auto pb-24" noValidate>
      <header className="mb-6 animate-in fade-in slide-in-from-top-2 duration-500">
        <p className="text-[11px] uppercase tracking-[0.12em] text-text-muted font-semibold">
          Usuarios · Nuevo
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-strong">Crear usuario</h1>
        <p className="mt-1 text-sm text-text-muted">
          El usuario recibe un email de bienvenida con link para configurar su contraseña.
        </p>
      </header>

      <div className="space-y-5">
        <FormSection
          icon={ShieldCheck}
          title="Tipo de cuenta"
          description="Define qué puede ver y hacer el usuario."
          accent={
            kind === 'admin'
              ? 'copper'
              : kind === 'staff'
                ? 'mint'
                : kind === 'wholesale'
                  ? 'amber'
                  : 'lavender'
          }
        >
          <FormField label="Rol">
            <Select value={kind} onValueChange={(v) => setValue('kind', v as FormValues['kind'])}>
              <SelectTrigger className={INPUT_CLS}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="retail">Retail · Público general</SelectItem>
                <SelectItem value="wholesale">Wholesale · Mayorista</SelectItem>
                <SelectItem value="staff">Staff</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <p className="text-xs text-text-muted">{KIND_HINT[kind]}</p>
        </FormSection>

        <FormSection
          icon={UserPlus}
          title="Identidad"
          description="Cómo se va a llamar el usuario en Renew."
          accent="copper"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              label="Nombre"
              htmlFor="firstName"
              required
              error={errors.firstName?.message}
            >
              <Input
                id="firstName"
                placeholder="Juan"
                maxLength={40}
                autoComplete="given-name"
                className={INPUT_CLS}
                {...register('firstName')}
              />
            </FormField>
            <FormField
              label="Apellido"
              htmlFor="lastName"
              required
              error={errors.lastName?.message}
            >
              <Input
                id="lastName"
                placeholder="Pérez"
                maxLength={40}
                autoComplete="family-name"
                className={INPUT_CLS}
                {...register('lastName')}
              />
            </FormField>
          </div>
          <FormField label="Email" htmlFor="email" required error={errors.email?.message}>
            <Input
              id="email"
              type="email"
              autoComplete="off"
              placeholder="vos@ejemplo.com"
              className={INPUT_CLS}
              {...register('email')}
            />
          </FormField>
          <FormField label="Teléfono" htmlFor="phone" hint="Opcional">
            <Input
              id="phone"
              type="tel"
              placeholder="+595 981 123 456"
              className={INPUT_CLS}
              {...register('phone')}
            />
          </FormField>
        </FormSection>

        <FormSection
          icon={IdCard}
          title="Documento"
          description="CI o RUC paraguayo. Sirve para facturación y verificación."
          accent="mint"
        >
          <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-4">
            <FormField label="Tipo">
              <Select
                value={docType}
                onValueChange={(v) => setValue('documentType', v as 'CI' | 'RUC')}
              >
                <SelectTrigger className={INPUT_CLS}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CI">CI</SelectItem>
                  <SelectItem value="RUC">RUC</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField
              label="Número"
              htmlFor="documentNumber"
              required
              error={errors.documentNumber?.message}
              hint={docType === 'CI' ? 'Ej. 1234567' : 'Ej. 12345678-9'}
            >
              <Input
                id="documentNumber"
                inputMode={docType === 'CI' ? 'numeric' : 'text'}
                className={`${INPUT_CLS} num-tab`}
                {...register('documentNumber')}
              />
            </FormField>
          </div>
        </FormSection>

        {resetLink && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] p-5 animate-in fade-in zoom-in-95 duration-300">
            <div className="flex items-start gap-3">
              <span className="shrink-0 w-9 h-9 rounded-lg bg-emerald-500/20 text-emerald-300 grid place-items-center">
                <KeyRound className="w-4 h-4" strokeWidth={2.25} />
              </span>
              <div className="flex-1 min-w-0 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-emerald-200">Usuario creado</p>
                  <p className="text-xs text-emerald-200/80 mt-0.5">
                    Se envió un email de bienvenida. Si no llega, copiá este link y mandalo
                    manualmente.
                  </p>
                </div>
                <code className="block text-[11px] font-mono text-text-strong bg-bg-deep/60 border border-text-subtle/15 rounded-lg p-2.5 break-all leading-snug select-all">
                  {resetLink}
                </code>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      navigator.clipboard.writeText(resetLink).then(() => toast.success(t('copy')))
                    }
                  >
                    <ClipboardCopy className="w-3.5 h-3.5 mr-1.5" /> {t('copy')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => router.push(`/${locale}/admin/users` as `/${string}`)}
                  >
                    <Check className="w-3.5 h-3.5 mr-1.5" /> {t('backToList')}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="sticky bottom-0 mt-8 -mx-4 px-4 py-3 bg-bg-base/95 backdrop-blur-md border-t border-text-subtle/15 sm:mx-0">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-text-muted hidden sm:block">
            Recibe email de bienvenida con link de configuración de contraseña.
          </p>
          <div className="flex items-center gap-2 ml-auto">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.replace(`/${locale}/admin/users` as `/${string}`)}
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
                  <UserPlus className="w-4 h-4 mr-1.5" /> {t('submit')}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
