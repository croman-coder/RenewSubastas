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

type Kind = 'admin' | 'staff' | 'finanzas' | 'retail' | 'wholesale';
type Role = 'admin' | 'staff' | 'finanzas' | 'buyer';

interface Props {
  uid: string;
  locale: string;
  initialRole: Role;
  initialAudience: 'retail' | 'wholesale';
  initialStatus: 'active' | 'disabled';
}

// Folds (role, audience) into the operator-facing "kind" so the dropdown
// reads in plain Spanish: Retail, Wholesale, Staff, Admin.
function toKind(role: Role, audience: 'retail' | 'wholesale'): Kind {
  if (role === 'admin') return 'admin';
  if (role === 'staff') return 'staff';
  if (role === 'finanzas') return 'finanzas';
  return audience;
}

interface UpdatePayload {
  uid: string;
  role: Role;
  status: 'active' | 'disabled';
  audience?: 'retail' | 'wholesale';
}

function fromKind(kind: Kind, uid: string, status: 'active' | 'disabled'): UpdatePayload {
  if (kind === 'admin' || kind === 'staff' || kind === 'finanzas') {
    return { uid, role: kind, status };
  }
  return { uid, role: 'buyer', status, audience: kind };
}

export function EditRoleForm({ uid, locale, initialRole, initialAudience, initialStatus }: Props) {
  const t = useTranslations('admin.users.detail');
  const router = useRouter();
  const [kind, setKind] = useState<Kind>(toKind(initialRole, initialAudience));
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await httpsCallable(fb.functions, 'updateUserRole')(fromKind(kind, uid, status));
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Tipo de cuenta</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="retail">Retail (público general)</SelectItem>
              <SelectItem value="wholesale">Wholesale (mayorista)</SelectItem>
              <SelectItem value="staff">Staff</SelectItem>
              <SelectItem value="finanzas">Finanzas (pagos)</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-text-muted">
            {kind === 'retail' && 'Ve solo el catálogo público de retail.'}
            {kind === 'wholesale' && 'Ve únicamente subastas mayoristas.'}
            {kind === 'staff' && 'Carga vehículos y subastas. Email @santarosa.com.py.'}
            {kind === 'finanzas' && 'Confirma señas y ve ventas. Email @santarosa.com.py.'}
            {kind === 'admin' && 'Acceso total. Email @santarosa.com.py.'}
          </p>
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
