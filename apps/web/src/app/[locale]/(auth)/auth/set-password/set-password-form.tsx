'use client';

import { useState } from 'react';
import Link from 'next/link';
import { httpsCallable } from 'firebase/functions';
import { ArrowRight, CheckCircle2, Eye, EyeOff, Loader2, Lock, XCircle } from 'lucide-react';
import { fb } from '@/lib/firebase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

const MIN_LEN = 8;

export function SetPasswordForm({ locale, token }: { locale: string; token: string }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw.length < MIN_LEN) {
      setError(`La contraseña debe tener al menos ${MIN_LEN} caracteres.`);
      return;
    }
    if (pw !== pw2) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setSubmitting(true);
    try {
      await httpsCallable(fb.functions, 'redeemPasswordReset')({ token, password: pw });
      setDone(true);
    } catch (err) {
      const msg = (err as { message?: string }).message ?? '';
      if (msg.includes('expiró')) setError('El enlace expiró. Pedí uno nuevo a tu administrador.');
      else if (msg.includes('ya fue usado')) setError('Este enlace ya fue usado.');
      else if (msg.includes('inválido')) setError('El enlace es inválido.');
      else setError('No se pudo guardar la contraseña. Probá de nuevo.');
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="space-y-5 text-center">
        <span className="mx-auto w-12 h-12 rounded-full bg-danger/10 grid place-items-center">
          <XCircle className="w-6 h-6 text-danger" strokeWidth={2} />
        </span>
        <div className="space-y-1.5">
          <h1 className="text-xl font-bold tracking-tight text-text-strong">Enlace incompleto</h1>
          <p className="text-sm text-text-muted leading-relaxed">
            El enlace no es válido. Abrí el enlace completo desde tu correo.
          </p>
        </div>
        <Button asChild className="w-full h-11 rounded-xl">
          <Link href={`/${locale}/login` as `/${string}`}>Ir al inicio de sesión</Link>
        </Button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-5 text-center">
        <span className="mx-auto w-12 h-12 rounded-full bg-success/10 grid place-items-center">
          <CheckCircle2 className="w-6 h-6 text-success" strokeWidth={2} />
        </span>
        <div className="space-y-1.5">
          <h1 className="text-xl font-bold tracking-tight text-text-strong">Contraseña lista</h1>
          <p className="text-sm text-text-muted leading-relaxed">
            Ya podés iniciar sesión con tu nueva contraseña.
          </p>
        </div>
        <Button asChild className="w-full h-11 rounded-xl">
          <Link href={`/${locale}/login` as `/${string}`}>Iniciar sesión</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="space-y-1.5">
        <p className="text-[11px] uppercase tracking-[0.12em] text-copper font-semibold">
          Crear contraseña
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-text-strong">Elegí tu contraseña</h1>
        <p className="text-sm text-text-muted">
          Definí la contraseña para entrar a tu cuenta en Renew Subastas.
        </p>
      </header>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && (
          <Alert
            variant="destructive"
            className="animate-in fade-in slide-in-from-top-1 duration-300"
          >
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="pw" className="text-xs uppercase tracking-[0.08em] text-text-muted">
            Nueva contraseña
          </Label>
          <div className="relative">
            <Lock
              aria-hidden
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted/70 pointer-events-none"
              strokeWidth={2}
            />
            <Input
              id="pw"
              type={showPw ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="••••••••"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              className="h-11 pl-10 pr-10 rounded-xl bg-bg-deep/40 border-text-subtle/20 focus:border-copper/50 focus:ring-copper/30 transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 grid place-items-center rounded-md text-text-muted hover:text-text-strong hover:bg-bg-elev/60 transition-colors"
            >
              {showPw ? (
                <EyeOff className="w-4 h-4" strokeWidth={2} />
              ) : (
                <Eye className="w-4 h-4" strokeWidth={2} />
              )}
            </button>
          </div>
          <p className="text-xs text-text-muted pl-1">Mínimo {MIN_LEN} caracteres.</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pw2" className="text-xs uppercase tracking-[0.08em] text-text-muted">
            Repetir contraseña
          </Label>
          <div className="relative">
            <Lock
              aria-hidden
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted/70 pointer-events-none"
              strokeWidth={2}
            />
            <Input
              id="pw2"
              type={showPw ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="••••••••"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              className="h-11 pl-10 rounded-xl bg-bg-deep/40 border-text-subtle/20 focus:border-copper/50 focus:ring-copper/30 transition-colors"
            />
          </div>
        </div>

        <Button
          type="submit"
          disabled={submitting}
          className="group w-full h-11 rounded-xl text-sm font-semibold tracking-tight"
        >
          <span className="inline-flex items-center justify-center gap-2">
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.5} />
                Guardando…
              </>
            ) : (
              <>
                Guardar contraseña
                <ArrowRight
                  className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5"
                  strokeWidth={2.5}
                />
              </>
            )}
          </span>
        </Button>
      </form>
    </div>
  );
}
