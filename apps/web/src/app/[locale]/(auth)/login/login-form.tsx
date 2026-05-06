'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { ArrowRight, Eye, EyeOff, Loader2, Mail, Lock } from 'lucide-react';
import { fb } from '@/lib/firebase/client';
import { ROLE_HOME, type Role } from '@/lib/auth/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ForgotPasswordDialog } from './forgot-password-dialog';

const Schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});
type FormValues = z.infer<typeof Schema>;

export function LoginForm({ from, locale }: { from?: string; locale: string }) {
  const t = useTranslations('auth.login');
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(Schema),
  });

  async function onSubmit(data: FormValues) {
    setSubmitting(true);
    setError(null);
    try {
      const cred = await signInWithEmailAndPassword(fb.auth, data.email, data.password);
      const idToken = await cred.user.getIdToken(true);
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (j.error === 'account_disabled') setError(t('errors.accountDisabled'));
        else setError(t('errors.generic'));
        await fb.auth.signOut();
        return;
      }
      const { role } = (await res.json()) as { role: Role };
      const target = from && from.startsWith('/') ? from : ROLE_HOME[role];
      router.replace(`/${locale}${target}`);
      router.refresh();
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (
        code === 'auth/user-not-found' ||
        code === 'auth/wrong-password' ||
        code === 'auth/invalid-credential'
      ) {
        setError(t('errors.invalidCredentials'));
      } else {
        setError(t('errors.generic'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {error && (
        <Alert
          variant="destructive"
          className="animate-in fade-in slide-in-from-top-1 duration-300"
        >
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="email" className="text-xs uppercase tracking-[0.08em] text-text-muted">
          {t('email')}
        </Label>
        <div className="relative">
          <Mail
            aria-hidden
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted/70 pointer-events-none"
            strokeWidth={2}
          />
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="vos@ejemplo.com"
            className="h-11 pl-10 rounded-xl bg-bg-deep/40 border-text-subtle/20 focus:border-copper/50 focus:ring-copper/30 transition-colors"
            {...register('email')}
          />
        </div>
        {errors.email && <p className="text-xs text-danger pl-1">{t('errors.emailInvalid')}</p>}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password" className="text-xs uppercase tracking-[0.08em] text-text-muted">
            {t('password')}
          </Label>
          <ForgotPasswordDialog />
        </div>
        <div className="relative">
          <Lock
            aria-hidden
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted/70 pointer-events-none"
            strokeWidth={2}
          />
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="••••••••"
            className="h-11 pl-10 pr-10 rounded-xl bg-bg-deep/40 border-text-subtle/20 focus:border-copper/50 focus:ring-copper/30 transition-colors"
            {...register('password')}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 grid place-items-center rounded-md text-text-muted hover:text-text-strong hover:bg-bg-elev/60 transition-colors"
          >
            {showPassword ? (
              <EyeOff className="w-4 h-4" strokeWidth={2} />
            ) : (
              <Eye className="w-4 h-4" strokeWidth={2} />
            )}
          </button>
        </div>
        {errors.password && (
          <p className="text-xs text-danger pl-1">{t('errors.passwordTooShort')}</p>
        )}
      </div>

      <Button
        type="submit"
        disabled={submitting}
        className="group relative w-full h-11 rounded-xl text-sm font-semibold tracking-tight overflow-hidden"
      >
        <span className="inline-flex items-center justify-center gap-2">
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.5} />
              {t('submitting')}
            </>
          ) : (
            <>
              {t('submit')}
              <ArrowRight
                className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5"
                strokeWidth={2.5}
              />
            </>
          )}
        </span>
      </Button>
    </form>
  );
}
