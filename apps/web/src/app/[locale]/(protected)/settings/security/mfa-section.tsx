'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { onAuthStateChanged, type MultiFactorInfo, type User } from 'firebase/auth';
import { Loader2, ShieldCheck, ShieldOff } from 'lucide-react';
import { fb } from '@/lib/firebase/client';
import { describeMfaError, enrolledFactors, unenrollFactor } from '@/lib/auth/mfa-client';
import { Button } from '@/components/ui/button';

/**
 * Ajustes → Seguridad → "Verificación en dos pasos".
 *
 * Reads the enrolled factors from the Firebase CLIENT session (the same one
 * the change-password form relies on) rather than from the server: the
 * server cookie doesn't carry enrolment, and the client SDK is where
 * un-enrolment has to happen anyway. Enrolment itself lives on its own page
 * (/auth/mfa/enroll) because it needs a RECENT sign-in and ends with a forced
 * re-login — neither fits inside a settings panel.
 */
export function MfaSection({ locale }: { locale: string }) {
  const t = useTranslations('settings.security.mfa');
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [factors, setFactors] = useState<MultiFactorInfo[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(fb.auth, (u) => {
      setUser(u);
      setFactors(u ? enrolledFactors(u) : []);
    });
    return () => unsub();
  }, []);

  async function remove(factor: MultiFactorInfo) {
    if (!user || busy) return;
    if (!window.confirm(t('confirmRemove'))) return;
    setBusy(true);
    try {
      await unenrollFactor(user, factor);
      setFactors(enrolledFactors(user));
      toast.success(t('removed'));
    } catch (e) {
      toast.error(describeMfaError(e));
    } finally {
      setBusy(false);
    }
  }

  const enrolled = factors.length > 0;

  return (
    <section className="space-y-3 max-w-md">
      <div className="flex items-start gap-3">
        <span
          className={
            'mt-0.5 w-9 h-9 rounded-lg grid place-items-center shrink-0 ring-1 ' +
            (enrolled
              ? 'bg-success/10 ring-success/30 text-success'
              : 'bg-text-strong/[0.06] ring-text-subtle/20 text-text-strong')
          }
        >
          {enrolled ? (
            <ShieldCheck className="w-4 h-4" strokeWidth={2.25} />
          ) : (
            <ShieldOff className="w-4 h-4" strokeWidth={2.25} />
          )}
        </span>
        <div className="space-y-1 min-w-0">
          <h2 className="text-sm font-semibold text-text-strong">{t('title')}</h2>
          <p className="text-xs text-text-muted">{t('description')}</p>
        </div>
      </div>

      {user === undefined ? (
        <Loader2 className="w-4 h-4 animate-spin text-text-muted" />
      ) : !user ? (
        <p className="text-xs text-text-muted">{t('noClientSession')}</p>
      ) : enrolled ? (
        <ul className="space-y-2">
          {factors.map((f) => (
            <li
              key={f.uid}
              className="flex items-center justify-between gap-3 rounded-lg border border-text-subtle/15 bg-bg-elev/40 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm text-text-strong truncate">
                  {f.displayName ?? t('factorFallback')}
                </p>
                <p className="text-[11px] text-text-muted">
                  {t('enrolledOn', { date: new Date(f.enrollmentTime).toLocaleDateString(locale) })}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void remove(f)}
                className="shrink-0"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t('remove')}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <Button asChild variant="outline" className="rounded-lg">
          <Link href={`/${locale}/auth/mfa/enroll?from=/settings/security` as `/${string}`}>
            {t('enable')}
          </Link>
        </Button>
      )}
    </section>
  );
}
