'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { Loader2 } from 'lucide-react';
import { fb } from '@/lib/firebase/client';
import { postSession, safeRedirect } from '@/lib/auth/post-session';
import { homeFor } from '@/lib/auth/constants';
import { Button } from '@/components/ui/button';

function GoogleGlyph() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.24 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}

export function GoogleSignInButton({ from, locale }: { from?: string; locale: string }) {
  const t = useTranslations('auth.login');
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    try {
      const cred = await signInWithPopup(fb.auth, new GoogleAuthProvider());
      // Provision (or resolve) the account server-side; forces buyer/retail
      // for new users, no-ops for existing ones.
      await httpsCallable(fb.functions, 'registerGoogleBuyer')();
      // Force-refresh so the JWT carries the freshly-set custom claims.
      const idToken = await cred.user.getIdToken(true);
      const result = await postSession(idToken);
      if (!result.ok) {
        toast.error(
          result.error === 'account_disabled'
            ? t('errors.accountDisabled')
            : t('errors.googleFailed'),
        );
        await signOut(fb.auth).catch(() => {});
        return;
      }
      const target = safeRedirect(from) ?? homeFor(result.role, result.audience ?? undefined);
      router.replace(`/${locale}${target}`);
      router.refresh();
    } catch (e) {
      const code = (e as { code?: string }).code ?? '';
      // User closed/cancelled the popup — not an error worth surfacing.
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return;
      }
      if (code === 'auth/popup-blocked') {
        toast.error(t('errors.popupBlocked'));
        return;
      }
      toast.error(t('errors.googleFailed'));
      await signOut(fb.auth).catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      disabled={busy}
      className="w-full h-11 rounded-xl gap-2 border-text-subtle/20"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} /> : <GoogleGlyph />}
      {busy ? t('submitting') : t('googleButton')}
    </Button>
  );
}
