'use client';

import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { toast } from 'sonner';
import { KeyRound, Mail } from 'lucide-react';
import { fb } from '@/lib/firebase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

/**
 * Public-facing "forgot password" entry point. Submits the email to the
 * `requestPasswordReset` callable, which queues the request for admin review.
 *
 * UI deliberately stays vague about whether the email exists — both success
 * paths surface the same toast so attackers can't probe the user database.
 */
export function ForgotPasswordDialog() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const trimmed = email.trim();
    if (!trimmed.includes('@')) {
      toast.error('Ingresá un email válido.');
      return;
    }
    setSubmitting(true);
    try {
      await httpsCallable(fb.functions, 'requestPasswordReset')({ email: trimmed });
      setDone(true);
      toast.success('Solicitud enviada. El administrador te contactará en breve.');
    } catch (err) {
      const msg = (err as Error).message ?? '';
      if (msg.includes('Email inválido')) {
        toast.error('Email inválido.');
      } else {
        toast.error('No pudimos procesar tu solicitud. Intentá de nuevo.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setEmail('');
    setDone(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          // Defer state reset until the close animation finishes so the user
          // doesn't see the form flash back before disappearing.
          setTimeout(reset, 200);
        }
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className="text-xs text-text-muted hover:text-copper transition-colors underline-offset-4 hover:underline"
        >
          ¿Olvidaste tu contraseña?
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2.5 mb-1">
            <span className="w-8 h-8 rounded-lg bg-copper/15 text-copper grid place-items-center">
              <KeyRound className="w-4 h-4" strokeWidth={2.25} />
            </span>
            <DialogTitle className="tracking-tight">Recuperar contraseña</DialogTitle>
          </div>
          <DialogDescription className="text-text-muted">
            {done
              ? 'Revisa tus mensajes — el administrador te enviará el link de recuperación cuando confirme tu identidad.'
              : 'Ingresá el email con el que te registraste. Vamos a enviarle una solicitud al administrador para que te contacte.'}
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200 flex items-start gap-2.5">
            <Mail className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={2.25} />
            <div>
              <p className="font-medium">Solicitud registrada</p>
              <p className="text-xs text-emerald-200/80 mt-1">
                Si el email está registrado en Renew, el administrador recibirá tu solicitud y te
                enviará un link de recuperación a la brevedad.
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reset-email">Correo electrónico</Label>
              <Input
                id="reset-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vos@ejemplo.com"
                className="h-11"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Enviando…' : 'Enviar solicitud'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
