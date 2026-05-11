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
import { homeFor, type Audience, type Role } from '@/lib/auth/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RenewWordmark } from '@/components/brand/renew-wordmark';
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
  // `entering` stays true through the post-success window — between
  // router.replace() and the new dashboard's first paint. Without it, the
  // user clicks "Entrar", the spinner disappears, and they stare at a frozen
  // login form for 1-2s while Next renders the dashboard server-side. Now
  // we paint a full-screen branded handoff during that gap.
  const [entering, setEntering] = useState(false);
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
      const { role, audience } = (await res.json()) as { role: Role; audience: Audience | null };
      const target = from && from.startsWith('/') ? from : homeFor(role, audience ?? undefined);
      // Flip to "entering" before the navigation kicks off so the user sees
      // the handoff screen for the entire RSC fetch, not just for the part
      // before router.replace returns.
      setEntering(true);
      router.replace(`/${locale}${target}`);
      router.refresh();
      // Deliberately don't reset `submitting` or `entering` here — the
      // component is about to unmount when the dashboard mounts.
      return;
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
      setSubmitting(false);
    }
  }

  return (
    <>
      {entering && <EnteringOverlay />}
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
            <Label
              htmlFor="password"
              className="text-xs uppercase tracking-[0.08em] text-text-muted"
            >
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
    </>
  );
}

/**
 * Full-screen branded loading state shown after credentials succeed and
 * before the dashboard's first paint. Replaces the awkward "frozen form"
 * gap with something that feels intentional.
 */
function EnteringOverlay() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Ingresando"
      className="fixed inset-0 z-[80] grid place-items-center bg-bg-base/95 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="flex flex-col items-center gap-6">
        <div className="relative">
          {/* Pulsing copper ring around the wordmark */}
          <span
            aria-hidden
            className="absolute -inset-6 rounded-full border-2 border-copper/30 animate-ping"
          />
          <span aria-hidden className="absolute -inset-3 rounded-full border border-copper/50" />
          <RenewWordmark size="lg" />
        </div>
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <Loader2 className="w-4 h-4 animate-spin text-copper" strokeWidth={2.5} />
          <span>Preparando tu panel…</span>
        </div>
      </div>
    </div>
  );
}
