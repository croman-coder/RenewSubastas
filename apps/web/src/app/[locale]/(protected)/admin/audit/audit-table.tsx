'use client';
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
import type { AuditEntry } from '@/lib/admin/list-audit';

interface Props {
  locale: string;
  items: AuditEntry[];
  nextCursor: string | null;
  currentAction: string | null;
}

const ACTIONS = [
  'user.create',
  'user.update_role',
  'user.delete',
  'user.password_reset_generated',
  'user.revoke_sessions',
  'app_config.update',
];

export function AuditTable({ locale, items, nextCursor, currentAction }: Props) {
  const t = useTranslations('admin.audit');
  const router = useRouter();
  const sp = useSearchParams();

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('cursor');
    router.replace(`/${locale}/admin/audit?${next.toString()}` as `/${string}`);
  }

  function loadMore() {
    if (!nextCursor) return;
    const next = new URLSearchParams(sp.toString());
    next.set('cursor', nextCursor);
    router.replace(`/${locale}/admin/audit?${next.toString()}` as `/${string}`);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-text-strong">{t('title')}</h1>
      <Select
        value={currentAction ?? 'all'}
        onValueChange={(v) => setParam('action', v === 'all' ? null : v)}
      >
        <SelectTrigger className="w-64">
          <SelectValue placeholder={t('filters.action')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('filters.all')}</SelectItem>
          {ACTIONS.map((a) => (
            <SelectItem key={a} value={a}>
              {a}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="border border-text-subtle/20 rounded">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('columns.createdAt')}</TableHead>
              <TableHead>{t('columns.actor')}</TableHead>
              <TableHead>{t('columns.action')}</TableHead>
              <TableHead>{t('columns.resource')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="stagger-in">
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-text-muted py-8">
                  {t('empty')}
                </TableCell>
              </TableRow>
            )}
            {items.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="text-text-muted text-sm num-tab">
                  {new Date(e.createdAt).toLocaleString(locale)}
                </TableCell>
                <TableCell className="font-mono text-xs">{e.actorUid}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{e.action}</Badge>
                </TableCell>
                <TableCell className="text-xs text-text-muted">
                  {e.resourceType}/{e.resourceId}
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
