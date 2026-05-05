'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { httpsCallable } from 'firebase/functions';
import { toast } from 'sonner';
import { fb } from '@/lib/firebase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Props {
  uid: string;
  locale: string;
  initialRole: 'admin' | 'staff' | 'buyer';
  initialStatus: 'active' | 'disabled';
}

export function EditRoleForm({ uid, locale, initialRole, initialStatus }: Props) {
  const t = useTranslations('admin.users.detail');
  const router = useRouter();
  const [role, setRole] = useState(initialRole);
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await httpsCallable(fb.functions, 'updateUserRole')({ uid, role, status });
      toast.success(t('saved'));
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message ?? t('errors.generic'));
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount() {
    if (!confirm(t('deleteConfirmText'))) return;
    setBusy(true);
    try {
      await httpsCallable(fb.functions, 'deleteUser')({ uid });
      router.replace(`/${locale}/admin/users` as `/${string}`);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message ?? t('errors.generic'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Rol</Label>
          <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">admin</SelectItem>
              <SelectItem value="staff">staff</SelectItem>
              <SelectItem value="buyer">buyer</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Estado</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Activo</SelectItem>
              <SelectItem value="disabled">Desactivado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex gap-3">
        <Button onClick={save} disabled={busy}>
          {busy ? t('saving') : t('saveChanges')}
        </Button>
        <Button variant="destructive" onClick={deleteAccount} disabled={busy}>
          {t('deleteAccount')}
        </Button>
      </div>
    </div>
  );
}
