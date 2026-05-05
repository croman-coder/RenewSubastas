'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { httpsCallable } from 'firebase/functions';
import { signOut } from 'firebase/auth';
import { toast } from 'sonner';
import { fb } from '@/lib/firebase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function DeleteAccountDialog({ uid, locale }: { uid: string; locale: string }) {
  const t = useTranslations('settings.dangerZone');
  const router = useRouter();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  async function onConfirm() {
    setBusy(true);
    try {
      await httpsCallable(fb.functions, 'deleteUser')({ uid });
      await fetch('/api/session', { method: 'DELETE' });
      await signOut(fb.auth);
      router.replace(`/${locale}/login`);
      router.refresh();
    } catch {
      toast.error(t('errors.generic'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="destructive">{t('deleteAccount')}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('deleteAccount')}</DialogTitle>
          <DialogDescription>{t('deleteDescription')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <p className="text-sm">{t('confirmText')}</p>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('confirmPlaceholder')}
          />
        </div>
        <DialogFooter>
          <Button variant="destructive" onClick={onConfirm} disabled={busy || text !== 'ELIMINAR'}>
            {busy ? t('deleting') : t('confirmButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
