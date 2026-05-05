'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { httpsCallable } from 'firebase/functions';
import { toast } from 'sonner';
import { fb } from '@/lib/firebase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Initial {
  adminStaffDomain: string;
  fromAddress: string;
  fromName: string;
}

export function EmailsForm({ initial }: { initial: Initial }) {
  const t = useTranslations('admin.config');
  const router = useRouter();
  const [domain, setDomain] = useState(initial.adminStaffDomain);
  const [from, setFrom] = useState(initial.fromAddress);
  const [name, setName] = useState(initial.fromName);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await httpsCallable(
        fb.functions,
        'updateGlobalConfig',
      )({
        emails: { adminStaffDomain: domain, fromAddress: from, fromName: name },
      });
      toast.success(t('saved'));
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message ?? t('errors.generic'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-medium text-text-strong">{t('emails.title')}</h2>
      <div className="space-y-2 max-w-lg">
        <Label htmlFor="domain">{t('emails.adminStaffDomain')}</Label>
        <Input id="domain" value={domain} onChange={(e) => setDomain(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-4 max-w-lg">
        <div className="space-y-2">
          <Label htmlFor="from">{t('emails.fromAddress')}</Label>
          <Input id="from" type="email" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="name">{t('emails.fromName')}</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
      </div>
      <Button onClick={save} disabled={busy}>
        {busy ? t('saving') : t('save')}
      </Button>
    </section>
  );
}
