'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Loader2, ShieldCheck } from 'lucide-react';
import { isValidCodeShape, normalizeCode } from '@/lib/auth/mfa-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface Props {
  /** Email of the account mid-sign-in, shown so the person knows which
   *  authenticator entry to read. */
  email: string | null;
  busy: boolean;
  error: string | null;
  onSubmit: (code: string) => void;
  onCancel: () => void;
}

/**
 * Second step of a sign-in for an account with an authenticator app
 * enrolled: the 6-digit code. Shown by the login form in place of the
 * credentials form once Firebase answers `auth/multi-factor-auth-required`.
 * Provider-agnostic — the same step follows a password or a Google sign-in.
 */
export function MfaCodeStep({ email, busy, error, onSubmit, onCancel }: Props) {
  const [code, setCode] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const valid = isValidCodeShape(code);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    onSubmit(normalizeCode(code));
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 w-9 h-9 rounded-lg bg-text-strong/[0.06] ring-1 ring-text-subtle/20 grid place-items-center shrink-0">
          <ShieldCheck className="w-4 h-4 text-text-strong" strokeWidth={2.25} />
        </span>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-text-strong">Verificación en dos pasos</p>
          <p className="text-xs text-text-muted">
            Abrí tu app autenticadora y escribí el código de 6 dígitos
            {email ? (
              <>
                {' '}
                de <span className="text-text-strong">{email}</span>
              </>
            ) : null}
            .
          </p>
        </div>
      </div>

      {error && (
        <Alert
          variant="destructive"
          className="animate-in fade-in slide-in-from-top-1 duration-300"
        >
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="mfa-code" className="text-xs uppercase tracking-[0.08em] text-text-muted">
          Código
        </Label>
        <Input
          ref={inputRef}
          id="mfa-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]*"
          maxLength={7}
          placeholder="123 456"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          disabled={busy}
          className="h-11 text-lg tracking-[0.3em] num-tab"
        />
      </div>

      <Button
        type="submit"
        disabled={!valid || busy}
        className="group relative w-full h-11 rounded-xl text-sm font-semibold tracking-tight"
      >
        <span className="inline-flex items-center justify-center gap-2">
          {busy ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.5} />
              Verificando…
            </>
          ) : (
            <>
              Verificar y entrar
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
        onClick={onCancel}
        disabled={busy}
        className="w-full text-xs text-text-muted hover:text-text-strong hover:underline underline-offset-4 disabled:opacity-50"
      >
        Volver e iniciar sesión con otra cuenta
      </button>
    </form>
  );
}
