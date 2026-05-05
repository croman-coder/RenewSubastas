'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { httpsCallable } from 'firebase/functions';
import { signOut } from 'firebase/auth';
import { fb } from '@/lib/firebase/client';
import { Button } from '@/components/ui/button';

export function RevokeSessionsButton({ locale }: { locale: string }) {
  const t = useTranslations('settings.security');
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    try {
      await httpsCallable(fb.functions, 'revokeMySessions')({});
      await fetch('/api/session', { method: 'DELETE' });
      await signOut(fb.auth);
      toast.success(t('revoked'));
      router.replace(`/${locale}/login?error=expired`);
      router.refresh();
    } catch {
      toast.error(t('errors.generic'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button variant="outline" onClick={onClick} disabled={busy}>
      {busy ? t('revoking') : t('revokeSessions')}
    </Button>
  );
}
