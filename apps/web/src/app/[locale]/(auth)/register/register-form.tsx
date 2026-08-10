'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { ArrowRight, Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react';
import { fb } from '@/lib/firebase/client';
import { homeFor } from '@/lib/auth/constants';
import { safeRedirect } from '@/lib/auth/post-session';
import { finalizePasswordAccount } from '@/lib/auth/finalize-password-account';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

// Same allowed charset as createUser's admin form / the buyer self-edit
// profile form (functions/src/auth/createUser.ts) — kept in sync manually,
// same as those two.
const NAME_RX = /^[\p{L}\p{M}'’\- .]+$/u;
const NAME_MSG = 'Solo letras, espacios, apóstrofes y guiones';

// Firebase's own floor is 6 characters — too weak for an account that can
// commit to buying a vehicle. This is enforced here for feedback only; see
// registerPasswordBuyer.ts's doc comment for what the server can (and can't)
// actually enforce, since the password itself never reaches our backend.
const PASSWORD_MIN_LEN = 10;

const Schema = z
  .object({
    firstName: z
      .string()
      .trim()
      .min(1, 'Requerido')
      .max(40, 'Máximo 40 caracteres')
      .regex(NAME_RX, NAME_MSG),
    lastName: z
      .string()
      .trim()
      .min(1, 'Requerido')
      .max(40, 'Máximo 40 caracteres')
      .regex(NAME_RX, NAME_MSG),
    email: z.string().trim().email('Email inválido'),
    password: z
      .string()
      .min(PASSWORD_MIN_LEN, `Mínimo ${PASSWORD_MIN_LEN} caracteres`)
      .max(128, 'Demasiado larga')
      .refine((v) => /[a-zA-Z]/.test(v), 'Incluí al menos una letra')
      .refine((v) => /[0-9]/.test(v), 'Incluí al menos un número'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  });
type FormValues = z.infer<typeof Schema>;

type Pending = { user: User; firstName: string; lastName: string };
type Phase = 'form' | 'pending-verification' | 'entering';

const RESEND_COOLDOWN_S = 30;
const POLL_INTERVAL_MS = 4000;

/**
 * Public self-registration with email + password. Mirrors
 * google-signin-button.tsx's shape (Firebase call → finalize → session →
 * redirect) but with a real wait in the middle: the account isn't
 * provisioned until the visitor proves they control the inbox (see
 * registerPasswordBuyer.ts). That means two phases instead of one click —
 * fill the form, then wait for the click in their email — each rendered as
 * its own screen in this same card.
 */
export function RegisterForm({ from, locale }: { from?: string; locale: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('form');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [checking, setChecking] = useState(false);
  // The interval below captures `checkVerified` once, when the effect sets
  // it up, and never again while polling — `checking` state read from that
  // frozen closure would always see its render-time snapshot (stale),
  // making the re-entrancy guard a no-op. A ref sidesteps that: reads
  // always see the latest value regardless of which render's closure is
  // asking. `checking` state itself still drives the UI (button
  // spinner/disabled) via the normal render cycle.
  const checkingRef = useRef(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendNotice, setResendNotice] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(Schema) });

  // Cooldown ticker for the resend button.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  // Poll for verification while waiting. Cross-tab/cross-device safe: the
  // link is applied server-side by Firebase the moment it's clicked
  // anywhere (see auth/action/action-handler.tsx), and reload() picks that
  // up on the very next tick here, whether that click happened in another
  // tab on this device or on a phone.
  useEffect(() => {
    if (phase !== 'pending-verification' || !pending) return;
    const id = setInterval(() => {
      void checkVerified(true);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [phase, pending]);

  async function onSubmit(data: FormValues) {
    setSubmitting(true);
    setError(null);
    try {
      const cred = await createUserWithEmailAndPassword(fb.auth, data.email, data.password);
      // Best-effort: nice to have in the Firebase console / as a fallback
      // name source for registerPasswordBuyer if this visitor ever ends up
      // provisioned through the plain login form instead (see
      // finalize-password-account.ts). Not load-bearing for this flow,
      // which passes the typed name explicitly below.
      await updateProfile(cred.user, {
        displayName: `${data.firstName} ${data.lastName}`.trim(),
      }).catch(() => {});
      await sendEmailVerification(cred.user);
      setPending({ user: cred.user, firstName: data.firstName, lastName: data.lastName });
      setPhase('pending-verification');
    } catch (e) {
      const code = (e as { code?: string }).code ?? '';
      if (code === 'auth/email-already-in-use') {
        setError('Ese correo ya tiene una cuenta. Iniciá sesión en vez de crear una nueva.');
      } else if (code === 'auth/invalid-email') {
        setError('Email inválido.');
      } else if (code === 'auth/weak-password') {
        setError(`La contraseña debe tener al menos ${PASSWORD_MIN_LEN} caracteres.`);
      } else {
        setError('No pudimos crear tu cuenta. Probá de nuevo en unos minutos.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function checkVerified(silent: boolean) {
    if (!pending || checkingRef.current) return;
    checkingRef.current = true;
    setChecking(true);
    try {
      await pending.user.reload();
      if (!pending.user.emailVerified) {
        if (!silent) setResendNotice('Todavía no detectamos la verificación. Revisá tu correo.');
        return;
      }
      setResendNotice(null);
      setPhase('entering');
      const result = await finalizePasswordAccount(pending.user, {
        firstName: pending.firstName,
        lastName: pending.lastName,
      });
      if (!result.ok) {
        setPhase('pending-verification');
        setError('Se verificó tu correo, pero no pudimos activar tu cuenta. Probá de nuevo.');
        return;
      }
      const target = safeRedirect(from) ?? homeFor(result.role, result.audience ?? undefined);
      router.replace(`/${locale}${target}`);
      router.refresh();
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  }

  async function onResend() {
    if (!pending || resendCooldown > 0) return;
    setResendNotice(null);
    try {
      await sendEmailVerification(pending.user);
      setResendNotice('Te reenviamos el correo de verificación.');
      setResendCooldown(RESEND_COOLDOWN_S);
    } catch (e) {
      const code = (e as { code?: string }).code ?? '';
      setResendNotice(
        code === 'auth/too-many-requests'
          ? 'Esperá un momento antes de pedir otro correo.'
          : 'No pudimos reenviar el correo. Probá de nuevo.',
      );
    }
  }

  async function onStartOver() {
    await signOut(fb.auth).catch(() => {});
    setPending(null);
    setError(null);
    setResendNotice(null);
    setPhase('form');
  }

  if (phase === 'entering') {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <Loader2 className="w-6 h-6 animate-spin text-copper" strokeWidth={2.5} />
        <p className="text-sm text-text-muted">Preparando tu cuenta…</p>
      </div>
    );
  }

  if (phase === 'pending-verification' && pending) {
    return (
      <div className="space-y-5 text-center" aria-live="polite">
        <span className="mx-auto w-12 h-12 rounded-full bg-copper/10 grid place-items-center">
          <Mail className="w-6 h-6 text-copper" strokeWidth={2} />
        </span>
        <div className="space-y-1.5">
          <h1 className="text-xl font-bold tracking-tight text-text-strong">Revisá tu correo</h1>
          <p className="text-sm text-text-muted leading-relaxed">
            Te enviamos un enlace de confirmación a{' '}
            <span className="font-medium text-text-strong">{pending.user.email}</span>. Abrilo para
            activar tu cuenta.
          </p>
        </div>

        {error && (
          <Alert variant="destructive" className="text-left">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {resendNotice && !error && <p className="text-xs text-text-muted">{resendNotice}</p>}

        <Button
          type="button"
          onClick={() => void checkVerified(false)}
          disabled={checking}
          className="w-full h-11 rounded-xl text-sm font-semibold tracking-tight"
        >
          {checking ? (
            <span className="inline-flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.5} />
              Comprobando…
            </span>
          ) : (
            'Ya verifiqué mi correo'
          )}
        </Button>

        <div className="flex items-center justify-between text-xs pt-1">
          <button
            type="button"
            onClick={() => void onResend()}
            disabled={resendCooldown > 0}
            className="text-text-muted hover:text-copper transition-colors underline-offset-4 hover:underline disabled:opacity-50 disabled:hover:no-underline"
          >
            {resendCooldown > 0 ? `Reenviar en ${resendCooldown}s` : 'Reenviar correo'}
          </button>
          <button
            type="button"
            onClick={() => void onStartOver()}
            className="text-text-muted hover:text-copper transition-colors underline-offset-4 hover:underline"
          >
            Usar otro correo
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <header className="space-y-1.5 mb-6">
        <p className="text-[11px] uppercase tracking-[0.12em] text-copper font-semibold">
          Registrate
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-text-strong">Creá tu cuenta</h1>
      </header>

      <form
        onSubmit={handleSubmit(onSubmit)}
        // Clears a stale server-side error (e.g. "ese correo ya tiene una
        // cuenta") the moment the visitor starts editing again — otherwise
        // it lingers next to a *new*, unrelated client-side validation
        // error if the resubmit gets blocked before onSubmit ever runs.
        onChange={() => error && setError(null)}
        className="space-y-4"
        noValidate
      >
        {error && (
          <Alert
            variant="destructive"
            className="animate-in fade-in slide-in-from-top-1 duration-300"
          >
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label
              htmlFor="firstName"
              className="text-xs uppercase tracking-[0.08em] text-text-muted"
            >
              Nombre
            </Label>
            <Input
              id="firstName"
              autoComplete="given-name"
              placeholder="Ana"
              className="h-11 rounded-xl bg-bg-deep/40 border-text-subtle/20 focus:border-copper/50 focus:ring-copper/30 transition-colors"
              {...register('firstName')}
            />
            {errors.firstName && (
              <p className="text-xs text-danger pl-1">{errors.firstName.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label
              htmlFor="lastName"
              className="text-xs uppercase tracking-[0.08em] text-text-muted"
            >
              Apellido
            </Label>
            <Input
              id="lastName"
              autoComplete="family-name"
              placeholder="Gómez"
              className="h-11 rounded-xl bg-bg-deep/40 border-text-subtle/20 focus:border-copper/50 focus:ring-copper/30 transition-colors"
              {...register('lastName')}
            />
            {errors.lastName && (
              <p className="text-xs text-danger pl-1">{errors.lastName.message}</p>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-xs uppercase tracking-[0.08em] text-text-muted">
            Correo electrónico
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
          {errors.email && <p className="text-xs text-danger pl-1">{errors.email.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-xs uppercase tracking-[0.08em] text-text-muted">
            Contraseña
          </Label>
          <div className="relative">
            <Lock
              aria-hidden
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted/70 pointer-events-none"
              strokeWidth={2}
            />
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
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
          {errors.password ? (
            <p className="text-xs text-danger pl-1">{errors.password.message}</p>
          ) : (
            <p className="text-xs text-text-muted pl-1">
              Mínimo {PASSWORD_MIN_LEN} caracteres, con letras y números.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor="confirmPassword"
            className="text-xs uppercase tracking-[0.08em] text-text-muted"
          >
            Repetir contraseña
          </Label>
          <div className="relative">
            <Lock
              aria-hidden
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted/70 pointer-events-none"
              strokeWidth={2}
            />
            <Input
              id="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="••••••••"
              className="h-11 pl-10 rounded-xl bg-bg-deep/40 border-text-subtle/20 focus:border-copper/50 focus:ring-copper/30 transition-colors"
              {...register('confirmPassword')}
            />
          </div>
          {errors.confirmPassword && (
            <p className="text-xs text-danger pl-1">{errors.confirmPassword.message}</p>
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
                Creando cuenta…
              </>
            ) : (
              <>
                Creá tu cuenta
                <ArrowRight
                  className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5"
                  strokeWidth={2.5}
                />
              </>
            )}
          </span>
        </Button>
      </form>

      <p className="mt-6 text-center text-xs text-text-muted">
        ¿Ya tenés cuenta?{' '}
        <Link
          href={`/${locale}/login` as `/${string}`}
          className="text-copper hover:underline underline-offset-4"
        >
          Iniciá sesión
        </Link>
      </p>
    </>
  );
}
