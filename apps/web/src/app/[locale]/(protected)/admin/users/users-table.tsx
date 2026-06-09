'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserRowActions } from './user-row-actions';
import type { UserListItem } from '@/lib/admin/list-users';

// Translates the (role, audience) pair into the operator-facing label so
// the table shows "Retail" / "Wholesale" instead of the technical "buyer".
function kindLabel(role: UserListItem['role'], audience: UserListItem['audience']): string {
  if (role === 'admin') return 'Admin';
  if (role === 'staff') return 'Staff';
  return audience === 'wholesale' ? 'Wholesale' : 'Retail';
}

interface Props {
  locale: string;
  items: UserListItem[];
  nextCursor: string | null;
  currentRole: 'admin' | 'staff' | 'buyer' | null;
  currentStatus: 'active' | 'disabled' | null;
}

export function UsersTable({ locale, items, nextCursor, currentRole, currentStatus }: Props) {
  const t = useTranslations('admin.users');
  const router = useRouter();
  const sp = useSearchParams();

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('cursor');
    router.replace(`/${locale}/admin/users?${next.toString()}` as `/${string}`);
  }

  function loadMore() {
    if (!nextCursor) return;
    const next = new URLSearchParams(sp.toString());
    next.set('cursor', nextCursor);
    router.replace(`/${locale}/admin/users?${next.toString()}` as `/${string}`);
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text-strong">{t('title')}</h1>
        <Link href={`/${locale}/admin/users/new` as `/${string}`}>
          <Button>{t('createNew')}</Button>
        </Link>
      </header>
      <div className="flex flex-wrap gap-3">
        <Select
          value={currentRole ?? 'all'}
          onValueChange={(v) => setParam('role', v === 'all' ? null : v)}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t('filters.role')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('filters.all')}</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="staff">Staff</SelectItem>
            <SelectItem value="buyer">Buyers (retail + wholesale)</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={currentStatus ?? 'all'}
          onValueChange={(v) => setParam('status', v === 'all' ? null : v)}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t('filters.status')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('filters.all')}</SelectItem>
            <SelectItem value="active">{t('status.active')}</SelectItem>
            <SelectItem value="disabled">{t('status.disabled')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="border border-text-subtle/20 rounded">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('columns.name')}</TableHead>
              <TableHead>{t('columns.email')}</TableHead>
              <TableHead>{t('columns.role')}</TableHead>
              <TableHead>{t('columns.status')}</TableHead>
              <TableHead>{t('columns.createdAt')}</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody className="stagger-in">
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-text-muted py-8">
                  {t('empty')}
                </TableCell>
              </TableRow>
            )}
            {items.map((u) => (
              <TableRow key={u.uid}>
                <TableCell>
                  <Link
                    href={`/${locale}/admin/users/${u.uid}` as `/${string}`}
                    className="hover:underline"
                  >
                    {u.firstName} {u.lastName}
                  </Link>
                </TableCell>
                <TableCell className="text-text-muted">{u.email}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{kindLabel(u.role, u.audience)}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={u.status === 'active' ? 'default' : 'outline'}>
                    {u.status === 'active' ? t('status.active') : t('status.disabled')}
                  </Badge>
                </TableCell>
                <TableCell className="text-text-muted text-sm num-tab">
                  {new Date(u.createdAt).toLocaleDateString(locale)}
                </TableCell>
                <TableCell>
                  <UserRowActions locale={locale} user={u} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {nextCursor && (
        <Button variant="outline" onClick={loadMore}>
          {t('loadMore')}
        </Button>
      )}
    </div>
  );
}
