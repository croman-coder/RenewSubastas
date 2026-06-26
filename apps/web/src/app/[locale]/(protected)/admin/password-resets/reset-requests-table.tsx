'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { httpsCallable } from 'firebase/functions';
import { doc, deleteDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { toast } from 'sonner';
import { Check, ClipboardCopy, Inbox, KeyRound, Trash2, type LucideIcon } from 'lucide-react';
import { fb } from '@/lib/firebase/client';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { PasswordResetRequestItem } from '@/lib/admin/list-password-reset-requests';

interface Props {
  locale: string;
  items: PasswordResetRequestItem[];
  currentStatus: 'pending' | 'resolved';
}

export function ResetRequestsTable({ locale, items, currentStatus }: Props) {
  const router = useRouter();

  function setTab(value: string) {
    router.replace(`/${locale}/admin/password-resets?status=${value}` as `/${string}`);
  }

  return (
    <div className="space-y-4">
      <Tabs value={currentStatus} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pending">Pendientes</TabsTrigger>
          <TabsTrigger value="resolved">Atendidas</TabsTrigger>
        </TabsList>
      </Tabs>

      {items.length === 0 ? (
        <EmptyState status={currentStatus} />
      ) : (
        <ul className="space-y-3">
          {items.map((req, i) => (
            <RequestRow key={req.id} req={req} locale={locale} index={i} />
          ))}
        </ul>
      )}
    </div>
  );
}

function RequestRow({
  req,
  locale,
  index,
}: {
  req: PasswordResetRequestItem;
  locale: string;
  index: number;
}) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function generateLink() {
    if (generating) return;
    setGenerating(true);
    try {
      const res = await httpsCallable<{ uid: string }, { resetLink: string; emailed: boolean }>(
        fb.functions,
        'generatePasswordReset',
      )({ uid: req.uid });
      setResetLink(res.data.resetLink);
      toast.success(
        res.data.emailed
          ? 'Link enviado por email al usuario. También podés copiarlo abajo.'
          : 'Link generado (email no enviado). Copialo y enviáselo manualmente.',
      );
    } catch (err) {
      toast.error((err as Error).message ?? 'No se pudo generar el link.');
    } finally {
      setGenerating(false);
    }
  }

  async function copyLink() {
    if (!resetLink) return;
    try {
      await navigator.clipboard.writeText(resetLink);
      toast.success('Link copiado al portapapeles.');
    } catch {
      toast.error('No se pudo copiar. Seleccionalo manualmente.');
    }
  }

  async function markResolved() {
    if (busy) return;
    setBusy(true);
    try {
      await updateDoc(doc(fb.db, 'password_reset_requests', req.id), {
        status: 'resolved',
        resolvedAt: serverTimestamp(),
      });
      toast.success('Marcada como atendida.');
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message ?? 'No se pudo actualizar la solicitud.');
    } finally {
      setBusy(false);
    }
  }

  async function discard() {
    if (busy) return;
    if (!window.confirm('¿Descartar esta solicitud sin generar el link?')) return;
    setBusy(true);
    try {
      await deleteDoc(doc(fb.db, 'password_reset_requests', req.id));
      toast.success('Solicitud descartada.');
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message ?? 'No se pudo descartar la solicitud.');
    } finally {
      setBusy(false);
    }
  }

  const fullName = [req.firstName, req.lastName].filter(Boolean).join(' ') || 'Sin nombre';
  const requestedAt = req.requestedAtMs
    ? new Date(req.requestedAtMs).toLocaleString(locale, {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

  return (
    <li
      className="rounded-xl border border-text-subtle/15 bg-bg-elev/40 p-4 sm:p-5 transition-all duration-300 hover:border-text-subtle/30 hover:bg-bg-elev/60 animate-in fade-in slide-in-from-bottom-1"
      style={{ animationDelay: `${index * 40}ms`, animationFillMode: 'both' }}
    >
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-5">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span className="w-10 h-10 rounded-lg bg-copper/10 text-copper grid place-items-center shrink-0">
            <KeyRound className="w-5 h-5" strokeWidth={2.25} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-text-strong truncate">{fullName}</p>
            <p className="text-xs text-text-muted truncate">{req.email}</p>
            <p className="text-[11px] text-text-muted/80 num-tab mt-0.5">
              Solicitado {requestedAt}
              {req.requestCount > 1 && (
                <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px] uppercase tracking-wide">
                  {req.requestCount} intentos
                </span>
              )}
            </p>
          </div>
        </div>

        {req.status === 'pending' && (
          <div className="flex flex-wrap gap-2 shrink-0 sm:justify-end">
            {!resetLink ? (
              <Button size="sm" onClick={generateLink} disabled={generating}>
                <KeyRound className="w-4 h-4 mr-1.5" />
                {generating ? 'Generando…' : 'Generar link'}
              </Button>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={copyLink}>
                  <ClipboardCopy className="w-4 h-4 mr-1.5" />
                  Copiar link
                </Button>
                <Button size="sm" onClick={markResolved} disabled={busy}>
                  <Check className="w-4 h-4 mr-1.5" />
                  Atendida
                </Button>
              </>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={discard}
              disabled={busy}
              className="text-text-muted hover:text-danger"
            >
              <Trash2 className="w-4 h-4" />
              <span className="sr-only">Descartar</span>
            </Button>
          </div>
        )}
      </div>

      {resetLink && (
        <div className="mt-3 rounded-lg bg-bg-deep/60 border border-text-subtle/10 px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-[0.08em] font-semibold text-text-muted mb-1.5">
            Link de recuperación (válido 1 hora)
          </p>
          <code className="block text-[11px] font-mono text-text-strong break-all leading-snug select-all">
            {resetLink}
          </code>
        </div>
      )}
    </li>
  );
}

function EmptyState({ status }: { status: 'pending' | 'resolved' }) {
  const Icon: LucideIcon = Inbox;
  const msg =
    status === 'pending'
      ? 'No hay solicitudes pendientes. Cuando un buyer pida resetear su contraseña, va a aparecer acá.'
      : 'No hay solicitudes atendidas todavía.';
  return (
    <div className="rounded-xl border border-dashed border-text-subtle/20 bg-bg-elev/30 px-6 py-16 text-center">
      <Icon className="w-10 h-10 mx-auto text-text-muted/50 mb-3" strokeWidth={1.5} />
      <p className="text-sm text-text-muted max-w-md mx-auto">{msg}</p>
    </div>
  );
}
