'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import QRCode from 'qrcode';
import { ArrowRight, CheckCircle2, Copy, Loader2, ShieldCheck, Smartphone } from 'lucide-react';
import { fb } from '@/lib/firebase/client';
import {
  describeMfaError,
  enrolledFactors,
  finishTotpEnrollment,
  isValidCodeShape,
  normalizeCode,
  startTotpEnrollment,
  type TotpEnrollment,
} from '@/lib/auth/mfa-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

type Phase =
  | { kind: 'loading' }
  | { kind: 'no-user' }
  | { kind: 'already'; user: User }
  | { kind: 'scan'; user: User; enrollment: TotpEnrollment; qr: string }
  | { kind: 'done'; email: string | null }
  | { kind: 'failed'; message: string };

/**
 * Three screens: scan the QR (or type the key), confirm with a code, done.
 *
 * After enrolment the person must sign in AGAIN: the token their current
 * session holds was issued by a one-factor sign-in and carries no
 * `sign_in_second_factor` claim, so /api/session would still refuse it. We
 * sign them out on the "done" screen and send them to /login, where Firebase
 * now challenges for the code and the cookie gets minted.
 */
export function EnrollForm({ locale, from }: { locale: string; from?: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(fb.auth, (user) => {
      if (!user) {
        setPhase({ kind: 'no-user' });
        return;
      }
      if (enrolledFactors(user).length > 0) {
        setPhase({ kind: 'already', user });
        return;
      }
      void (async () => {
        try {
          const enrollment = await startTotpEnrollment(user);
          const qr = await QRCode.toDataURL(enrollment.otpauthUrl, {
            margin: 1,
            width: 220,
            errorCorrectionLevel: 'M',
          });
          setPhase({ kind: 'scan', user, enrollment, qr });
        } catch (e) {
          setPhase({ kind: 'failed', message: describeMfaError(e) });
        }
      })();
    });
    return () => unsub();
  }, []);

  async function onConfirm(e: FormEvent) {
    e.preventDefault();
    if (phase.kind !== 'scan' || !isValidCodeShape(code) || busy) return;
    setBusy(true);
    setError(null);
    try {
      await finishTotpEnrollment(phase.user, phase.enrollment.secret, normalizeCode(code));
      setPhase({ kind: 'done', email: phase.user.email });
    } catch (err) {
      setError(describeMfaError(err));
    } finally {
      setBusy(false);
    }
  }

  async function goSignInAgain() {
    await signOut(fb.auth).catch(() => {});
    const q = new URLSearchParams({ mfa: 'enrolled', ...(from ? { from } : {}) });
    router.replace(`/${locale}/login?${q.toString()}` as `/${string}`);
  }

  async function copyKey() {
    if (phase.kind !== 'scan') return;
    try {
      await navigator.clipboard.writeText(phase.enrollment.secretKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the key is visible on screen anyway.
    }
  }

  if (phase.kind === 'loading') {
    return (
      <div className="flex items-center justify-center py-10 text-text-muted">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  if (phase.kind === 'no-user') {
    return (
      <div className="space-y-5 text-center">
        <p className="text-sm text-text-muted">
          Para activar la verificación en dos pasos primero tenés que iniciar sesión.
        </p>
        <Button asChild className="w-full h-11 rounded-xl">
          <Link href={`/${locale}/login` as `/${string}`}>Ir a iniciar sesión</Link>
        </Button>
      </div>
    );
  }

  if (phase.kind === 'failed') {
    return (
      <div className="space-y-5 text-center">
        <Alert variant="destructive">
          <AlertDescription>{phase.message}</AlertDescription>
        </Alert>
        <Button asChild variant="outline" className="w-full h-11 rounded-xl">
          <Link href={`/${locale}/login` as `/${string}`}>Volver al inicio de sesión</Link>
        </Button>
      </div>
    );
  }

  if (phase.kind === 'already') {
    return (
      <div className="space-y-5 text-center">
        <CheckCircle2 className="w-9 h-9 mx-auto text-success" strokeWidth={1.75} />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-text-strong">
            Esta cuenta ya tiene la verificación en dos pasos activa.
          </p>
          <p className="text-xs text-text-muted">
            Iniciá sesión de nuevo y vas a poder entrar con tu código.
          </p>
        </div>
        <Button onClick={() => void goSignInAgain()} className="w-full h-11 rounded-xl">
          Iniciar sesión con mi código
        </Button>
      </div>
    );
  }

  if (phase.kind === 'done') {
    return (
      <div className="space-y-5 text-center animate-in fade-in duration-300">
        <CheckCircle2 className="w-9 h-9 mx-auto text-success" strokeWidth={1.75} />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-text-strong">
            Verificación en dos pasos activada
          </p>
          <p className="text-xs text-text-muted">
            Desde ahora, cada vez que entres{phase.email ? ` con ${phase.email}` : ''} te vamos a
            pedir el código de la app además de tu contraseña. Guardá el acceso a esa app: sin ella
            no vas a poder entrar.
          </p>
        </div>
        <Button onClick={() => void goSignInAgain()} className="group w-full h-11 rounded-xl">
          <span className="inline-flex items-center gap-2">
            Iniciar sesión con mi código
            <ArrowRight
              className="w-4 h-4 transition-transform group-hover:translate-x-0.5"
              strokeWidth={2.5}
            />
          </span>
        </Button>
      </div>
    );
  }

  // phase.kind === 'scan'
  return (
    <form onSubmit={(e) => void onConfirm(e)} className="space-y-5" noValidate>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 w-9 h-9 rounded-lg bg-text-strong/[0.06] ring-1 ring-text-subtle/20 grid place-items-center shrink-0">
          <ShieldCheck className="w-4 h-4 text-text-strong" strokeWidth={2.25} />
        </span>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-text-strong">
            Activar verificación en dos pasos
          </p>
          <p className="text-xs text-text-muted">
            Tu rol lo requiere. Lleva un minuto y después entrás con tu contraseña más un código de
            6 dígitos que genera tu teléfono.
          </p>
        </div>
      </div>

      <ol className="space-y-4 text-sm">
        <li className="flex gap-3">
          <span className="w-6 h-6 rounded-full bg-text-strong text-bg-base text-xs font-semibold grid place-items-center shrink-0">
            1
          </span>
          <div className="space-y-1">
            <p className="text-text-strong">Instalá una app autenticadora si no tenés.</p>
            <p className="text-xs text-text-muted inline-flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5" aria-hidden />
              Google Authenticator, Microsoft Authenticator, Authy o 1Password.
            </p>
          </div>
        </li>
        <li className="flex gap-3">
          <span className="w-6 h-6 rounded-full bg-text-strong text-bg-base text-xs font-semibold grid place-items-center shrink-0">
            2
          </span>
          <div className="space-y-3 min-w-0">
            <p className="text-text-strong">Escaneá este código con la app.</p>
            <div className="rounded-xl bg-white p-2 w-fit ring-1 ring-text-subtle/20">
              <img
                src={phase.qr}
                alt="Código QR para la app autenticadora"
                width={220}
                height={220}
              />
            </div>
            <details className="text-xs text-text-muted">
              <summary className="cursor-pointer hover:text-text-strong">
                ¿No podés escanear? Ingresá la clave a mano
              </summary>
              <div className="mt-2 flex items-center gap-2">
                <code className="rounded-md bg-bg-elev px-2 py-1 font-mono text-[11px] tracking-wider break-all text-text-strong">
                  {phase.enrollment.secretKey}
                </code>
                <button
                  type="button"
                  onClick={() => void copyKey()}
                  className="shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-1 ring-1 ring-text-subtle/25 hover:ring-text-subtle/50"
                >
                  <Copy className="w-3 h-3" aria-hidden />
                  {copied ? 'Copiada' : 'Copiar'}
                </button>
              </div>
            </details>
          </div>
        </li>
        <li className="flex gap-3">
          <span className="w-6 h-6 rounded-full bg-text-strong text-bg-base text-xs font-semibold grid place-items-center shrink-0">
            3
          </span>
          <div className="space-y-2 flex-1">
            <Label htmlFor="enroll-code" className="text-text-strong font-normal">
              Escribí el código que muestra la app.
            </Label>
            <Input
              id="enroll-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]*"
              maxLength={7}
              placeholder="123 456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={busy}
              className="h-11 text-lg tracking-[0.3em] num-tab max-w-[12rem]"
            />
          </div>
        </li>
      </ol>

      {error && (
        <Alert
          variant="destructive"
          className="animate-in fade-in slide-in-from-top-1 duration-300"
        >
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button
        type="submit"
        disabled={!isValidCodeShape(code) || busy}
        className="group w-full h-11 rounded-xl text-sm font-semibold tracking-tight"
      >
        <span className="inline-flex items-center justify-center gap-2">
          {busy ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.5} />
              Activando…
            </>
          ) : (
            <>
              Activar
              <ArrowRight
                className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5"
                strokeWidth={2.5}
              />
            </>
          )}
        </span>
      </Button>

      <button
        type="button"
        onClick={() =>
          void signOut(fb.auth).then(() => router.replace(`/${locale}/login` as `/${string}`))
        }
        className="w-full text-xs text-text-muted hover:text-text-strong hover:underline underline-offset-4"
      >
        Ahora no — cerrar sesión
      </button>
    </form>
  );
}
