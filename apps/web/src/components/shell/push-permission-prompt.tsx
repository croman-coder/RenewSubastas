'use client';
import { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  enablePush,
  isPushSupported,
  onForegroundPush,
  pushPermission,
} from '@/lib/firebase/messaging';

interface Props {
  locale: string;
}

const DISMISS_KEY = 'renew:push:promptDismissedAt';
const DISMISS_TTL_MS = 7 * 24 * 3600_000;

/**
 * Soft permission prompt for FCM web push.
 *
 * UX:
 *   - Renders nothing if the browser doesn't support push (Safari < 16.4,
 *     iOS PWA without homescreen install, etc.) or if permission was
 *     already granted (or explicitly denied).
 *   - Otherwise shows a slim banner under the topbar that the user can
 *     either accept (one-tap enable) or dismiss for 7 days. We never
 *     re-prompt automatically — once the user opts out, they have to
 *     enable from settings.
 *
 * Also wires the foreground listener so a push that arrives while the
 * tab is focused surfaces as a toast (Firebase suppresses the OS-level
 * notification in that case).
 */
export function PushPermissionPrompt({ locale }: Props) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<NotificationPermission | 'unsupported' | null>(null);

  useEffect(() => {
    const perm = pushPermission();
    setState(perm);

    // Wire foreground messages regardless of whether we're showing the
    // banner. Buyers who enabled push on another tab still want toasts
    // here.
    const unsub = onForegroundPush(({ title, body, url }) => {
      toast.success(title, {
        description: body,
        ...(url
          ? {
              action: {
                label: 'Ver',
                onClick: () => {
                  if (url.startsWith('/')) {
                    window.location.assign(url);
                  }
                },
              },
            }
          : {}),
      });
    });

    if (perm !== 'default') return unsub;
    const dismissed = Number(window.localStorage.getItem(DISMISS_KEY) ?? 0);
    if (dismissed && Date.now() - dismissed < DISMISS_TTL_MS) return unsub;
    setVisible(true);
    return unsub;
  }, [locale]);

  if (!isPushSupported()) return null;
  if (state === 'granted' || state === 'denied' || state === 'unsupported') return null;
  if (!visible) return null;

  async function accept() {
    setBusy(true);
    try {
      const token = await enablePush();
      if (token) {
        toast.success('Notificaciones activadas');
        setState('granted');
        setVisible(false);
      } else {
        toast.error('No se pudieron activar las notificaciones');
        setVisible(false);
      }
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* private browsing */
    }
    setVisible(false);
  }

  return (
    <div
      role="region"
      aria-label="Activar notificaciones"
      className={
        'sticky top-14 z-20 border-b border-text-subtle/15 ' +
        'bg-bg-elev/95 backdrop-blur supports-[backdrop-filter]:bg-bg-elev/80 ' +
        'animate-in fade-in slide-in-from-top-1 duration-300'
      }
    >
      <div className="mx-auto max-w-7xl px-4 md:px-6 py-2 flex items-center gap-3">
        <span className="shrink-0 w-8 h-8 rounded-lg bg-text-strong/[0.08] ring-1 ring-text-subtle/25 grid place-items-center text-text-strong">
          <BellRing className="w-4 h-4" strokeWidth={2.25} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-text-strong font-medium leading-tight">
            Activá las notificaciones para enterarte al instante de cada nueva subasta.
          </p>
          <p className="text-xs text-text-muted mt-0.5 truncate">
            Funciona aún con la pestaña cerrada. Podés desactivarlo cuando quieras.
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={dismiss}
            disabled={busy}
            aria-label="No por ahora"
            className={
              'h-8 px-2.5 inline-flex items-center gap-1 rounded-md text-xs font-medium ' +
              'text-text-muted hover:text-text-strong hover:bg-bg-deep/60 transition-colors'
            }
          >
            <BellOff className="w-3.5 h-3.5" strokeWidth={2.25} />
            <span className="hidden sm:inline">No por ahora</span>
          </button>
          <button
            type="button"
            onClick={accept}
            disabled={busy}
            className={
              'h-8 px-3 inline-flex items-center gap-1.5 rounded-md text-xs font-semibold ' +
              'bg-text-strong text-bg-base hover:opacity-90 transition-opacity ' +
              'disabled:opacity-60 disabled:cursor-not-allowed'
            }
          >
            {busy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2.5} />
            ) : (
              <Bell className="w-3.5 h-3.5" strokeWidth={2.5} />
            )}
            Activar
          </button>
        </div>
      </div>
    </div>
  );
}
