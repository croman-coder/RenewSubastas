'use client';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { fb } from '@/lib/firebase/client';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';

export function LogoutButton({ locale }: { locale: string }) {
  const t = useTranslations('common');
  const router = useRouter();
  async function onClick() {
    await fetch('/api/session', { method: 'DELETE' });
    await signOut(fb.auth);
    router.replace(`/${locale}/login`);
    router.refresh();
  }
  return (
    <Button variant="outline" size="sm" onClick={onClick}>
      {t('signOut')}
    </Button>
  );
}
