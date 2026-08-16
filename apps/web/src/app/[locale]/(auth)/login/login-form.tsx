'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { sendEmailVerification, signInWithEmailAndPassword, type User } from 'firebase/auth';
import { ArrowRight, Eye, EyeOff, Loader2, Mail, Lock } from 'lucide-react';
import { fb } from '@/lib/firebase/client';
import { homeFor } from '@/lib/auth/constants';
import { safeRedirect } from '@/lib/auth/post-session';
import { finalizePasswordAccount } from '@/lib/auth/finalize-password-account';
import { trackCompleteRegistration } from '@/lib/analytics/meta-events';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RenewWordmark } from '@/components/brand/renew-wordmark';
import { ForgotPasswordDialog } from './forgot-password-dialog';
import { GoogleSignInButton } from './google-signin-button';

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
  // Set when sign-in succeeds but the account is a self-registration that
  // never finished email verification. Kept separate from `error` because
  // this state renders its own actions (resend, "ya verifiqué"), not just a
  // message — see the render block below.
  const [unverifiedUser, setUnverifiedUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendNotice, setResendNotice] = useState<string | null>(null);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  // If we landed here because the server bounced a disabled/revoked/expired
  // session, the (httpOnly) __session cookie is still set — only a server
  // route can clear it. Clear it (and any client auth state) on mount so the
  // user isn't stuck in a redirect loop and a fresh login can proceed cleanly.
  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get('error');
    // `temporary` llega cuando el servidor no pudo verificar la sesión, no
    // cuando la sesión dejó de valer. Ahí no se borra nada: la cookie sigue
    // siendo buena y en el próximo intento la persona entra sin volver a
    // escribir la contraseña. Borrarla —que es lo que pasaba cuando todo
    // desembocaba en `expired`— convertía un tropiezo de red en un cierre de
    // sesión real. Ver session-failure.ts.
    if (reason === 'temporary') {
      setError(t('errors.temporary'));
      return;
    }
    if (reason === 'disabled' || reason === 'expired' || reason === 'no_role') {
      void fetch('/api/session', { method: 'DELETE' }).catch(() => {});
      void fb.auth.signOut().catch(() => {});
      if (reason === 'disabled') setError(t('errors.accountDisabled'));
    }
  }, [t]);

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
    setUnverifiedUser(null);
    setResendNotice(null);
    try {
      const cred = await signInWithEmailAndPassword(fb.auth, data.email, data.password);
      // Try to provision/sign-in FIRST, and only look at emailVerified if
      // that fails. An account invited via createUser.ts already has
      // role/status claims the moment it's created — finalizePasswordAccount
      // succeeds for it regardless of emailVerified (which stays false
      // there until redeemPasswordReset.ts's password-set flow), so it
      // never reaches the branch below at all. That branch is only
      // reachable for an account with NO claims whatsoever, which
      // self-registration is the only path that produces. Checking
      // emailVerified first — the original shape of this gate — assumed
      // false always meant "unfinished self-registration", which is wrong
      // for every admin-panel account: createUser.ts creates all of them
      // with emailVerified:false, so that ordering locked out the entire
      // existing staff/admin/finanzas base.
      let result;
      try {
        result = await finalizePasswordAccount(cred.user);
      } catch {
        // A real failure inside finalizePasswordAccount (rate-limited,
        // server error, dropped connection) rather than the expected
        // "not applicable" precondition it already swallows internally —
        // don't leave a half-signed-in session dangling.
        setError(t('errors.generic'));
        await fb.auth.signOut().catch(() => {});
        setSubmitting(false);
        return;
      }
      if (!result.ok) {
        if (!cred.user.emailVerified) {
          // Firebase signs this in regardless of verification status. A
          // self-registered buyer who never clicked the verification link
          // has no users/{uid} doc and no claims — provisioning above
          // failed for exactly that reason. Surface it here, where we
          // actually know why, and offer the resend affordance, instead of
          // the generic "account_disabled" below (which reads like an
          // admin disabled the account).
          setUnverifiedUser(cred.user);
          setSubmitting(false);
          return;
        }
        if (result.error === 'account_disabled') {
          setError(t('errors.accountDisabled'));
        } else if (
          result.error === 'server_misconfigured' ||
          result.error === 'session_creation_failed'
        ) {
          setError(
            'Servicio no disponible. El equipo fue notificado. Probá de nuevo en unos minutos.',
          );
        } else if (result.error === 'forbidden_origin') {
          setError('Origen no permitido. Cerrá la pestaña y volvé a abrir el sitio.');
        } else {
          setError(t('errors.generic'));
        }
        await fb.auth.signOut();
        return;
      }
      // Almost always false on this path — this is the sign-in form. It
      // turns true for the buyer who verified their email but never returned
      // to the registration tab: their account is provisioned right here, so
      // this login IS the alta, and it is the only moment it can be reported.
      if (result.isNewAccount) trackCompleteRegistration('email', cred.user.uid);
      const { role, audience } = result;
      const target = safeRedirect(from) ?? homeFor(role, audience ?? undefined);
      setEntering(true);
      router.replace(`/${locale}${target}`);
      router.refresh();
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

  async function onResendVerification() {
    if (!unverifiedUser || resendCooldown > 0) return;
    setResendNotice(null);
    try {
      await sendEmailVerification(unverifiedUser);
      setResendNotice(t('unverified.resendSuccess'));
      setResendCooldown(30);
    } catch (e) {
      const code = (e as { code?: string }).code ?? '';
      setResendNotice(
        code === 'auth/too-many-requests'
          ? t('unverified.resendTooMany')
          : t('unverified.resendFailed'),
      );
    }
  }

  async function onCheckVerified() {
    if (!unverifiedUser) return;
    setChecking(true);
    try {
      await unverifiedUser.reload();
      if (!unverifiedUser.emailVerified) {
        setResendNotice(t('unverified.stillNotVerified'));
        return;
      }
      const result = await finalizePasswordAccount(unverifiedUser);
      if (!result.ok) {
        setUnverifiedUser(null);
        setError(t('unverified.activationFailed'));
        await fb.auth.signOut();
        return;
      }
      if (result.isNewAccount) trackCompleteRegistration('email', unverifiedUser.uid);
      const target = safeRedirect(from) ?? homeFor(result.role, result.audience ?? undefined);
      setEntering(true);
      router.replace(`/${locale}${target}`);
      router.refresh();
    } catch {
      // A hard failure (e.g. network drop mid-reload) — leave no half-signed
      // in state dangling, same as the `!result.ok` branch above and as
      // onSubmit does for its own equivalent failure.
      setUnverifiedUser(null);
      setError(t('errors.generic'));
      await fb.auth.signOut().catch(() => {});
    } finally {
      setChecking(false);
    }
  }

  return (
    <>
      {entering && <EnteringOverlay />}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {unverifiedUser ? (
          <Alert className="animate-in fade-in slide-in-from-top-1 duration-300">
            <AlertDescription className="space-y-2">
              <p>{t('unverified.message')}</p>
              {resendNotice && <p className="text-xs text-text-muted">{resendNotice}</p>}
              <div className="flex items-center gap-4 text-xs pt-0.5">
                <button
                  type="button"
                  onClick={() => void onCheckVerified()}
                  disabled={checking}
                  className="font-semibold text-copper hover:underline underline-offset-4 disabled:opacity-50"
                >
                  {checking ? t('unverified.checking') : t('unverified.checkButton')}
                </button>
                <button
                  type="button"
                  onClick={() => void onResendVerification()}
                  disabled={resendCooldown > 0}
                  className="text-text-muted hover:text-copper hover:underline underline-offset-4 disabled:opacity-50 disabled:hover:no-underline"
                >
                  {resendCooldown > 0
                    ? t('unverified.resendCountdown', { seconds: resendCooldown })
                    : t('unverified.resendButton')}
                </button>
              </div>
            </AlertDescription>
          </Alert>
        ) : (
          error && (
            <Alert
              variant="destructive"
              className="animate-in fade-in slide-in-from-top-1 duration-300"
            >
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )
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
              inputMode="email"
              spellCheck={false}
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
      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center" aria-hidden>
          <span className="w-full border-t border-text-subtle/20" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-bg-base px-3 text-xs uppercase tracking-[0.08em] text-text-muted">
            {t('orDivider')}
          </span>
        </div>
      </div>
      <GoogleSignInButton {...(from !== undefined ? { from } : {})} locale={locale} />
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
