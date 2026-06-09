'use client';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { httpsCallable } from 'firebase/functions';
import { toast } from 'sonner';
import { fb } from '@/lib/firebase/client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import type { UserListItem } from '@/lib/admin/list-users';

export function UserRowActions({ locale, user }: { locale: string; user: UserListItem }) {
  const t = useTranslations('admin.users.actions');
  const tDetail = useTranslations('admin.users.detail');
  const router = useRouter();

  async function toggleStatus() {
    const newStatus = user.status === 'active' ? 'disabled' : 'active';
    try {
      await httpsCallable(fb.functions, 'updateUserRole')({ uid: user.uid, status: newStatus });
      toast.success(tDetail('saved'));
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message ?? tDetail('errors.generic'));
    }
  }

  async function deleteUser() {
    if (!confirm(tDetail('deleteConfirmText'))) return;
    try {
      await httpsCallable(fb.functions, 'deleteUser')({ uid: user.uid });
      toast.success(tDetail('saved'));
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message ?? tDetail('errors.generic'));
    }
  }

  // Hard-delete is a permanent destruction (Auth + Firestore). Two-step
  // safety: the user must already be soft-disabled, and the admin types the
  // email exactly to confirm. Only surfaced on already-disabled non-admin
  // accounts so it's nearly impossible to fire by accident.
  async function hardDeleteUser() {
    const typed = window.prompt(tDetail('hardDeletePrompt', { email: user.email }));
    if (typed === null) return;
    if (typed.trim().toLowerCase() !== user.email.toLowerCase()) {
      toast.error(tDetail('hardDeleteMismatch'));
      return;
    }
    try {
      await httpsCallable(fb.functions, 'hardDeleteUser')({ uid: user.uid });
      toast.success(tDetail('hardDeleteSuccess'));
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message ?? tDetail('errors.generic'));
    }
  }

  const canHardDelete = user.status === 'disabled' && user.role !== 'admin';

  async function resetPassword() {
    try {
      const res = await httpsCallable<{ uid: string }, { resetLink: string; emailed: boolean }>(
        fb.functions,
        'generatePasswordReset',
      )({ uid: user.uid });
      await navigator.clipboard.writeText(res.data.resetLink).catch(() => {});
      toast.success(
        res.data.emailed
          ? 'Email de reseteo enviado al usuario (link también copiado).'
          : 'Link copiado (email no enviado).',
      );
    } catch (e) {
      toast.error((e as Error).message ?? tDetail('errors.generic'));
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Actions">
          &#8943;
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={() => router.push(`/${locale}/admin/users/${user.uid}` as `/${string}`)}
        >
          {t('viewEdit')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={resetPassword}>{t('resetPassword')}</DropdownMenuItem>
        <DropdownMenuItem onSelect={toggleStatus}>
          {user.status === 'active' ? t('disable') : t('enable')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={deleteUser} className="text-danger">
          {t('delete')}
        </DropdownMenuItem>
        {canHardDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={hardDeleteUser} className="text-danger font-semibold">
              {t('hardDelete')}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
