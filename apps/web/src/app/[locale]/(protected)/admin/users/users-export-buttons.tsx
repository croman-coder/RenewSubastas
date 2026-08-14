'use client';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

type Format = 'xlsx' | 'pdf';

/**
 * Downloads the current user list as a spreadsheet or a PDF.
 *
 * Fetched into a blob rather than pointed at with a plain `<a download>`: the
 * endpoint answers errors as JSON, and a bare link would happily save the
 * error body to the operator's Downloads folder as `usuarios-…xlsx`. Going
 * through fetch lets a failure surface as a toast, and gives the buttons a
 * pending state — the export walks the whole collection, so a large account
 * base takes a moment.
 */
export function UsersExportButtons() {
  const t = useTranslations('admin.users.export');
  const sp = useSearchParams();
  const [pending, setPending] = useState<Format | null>(null);

  async function download(format: Format) {
    setPending(format);
    try {
      const params = new URLSearchParams({ format });
      // Only the filters travel — never `cursor`. An export always covers the
      // whole filtered set, not the page currently on screen.
      for (const key of ['kind', 'status']) {
        const value = sp.get(key);
        if (value) params.set(key, value);
      }
      const res = await fetch(`/api/admin/users/export?${params.toString()}`);
      if (!res.ok) throw new Error(`export responded ${res.status}`);
      saveBlob(await res.blob(), filenameFrom(res) ?? `usuarios.${format}`);
    } catch (err) {
      console.error('[users export]', err);
      toast.error(t('error'));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => download('xlsx')}
        disabled={pending !== null}
      >
        {pending === 'xlsx' ? t('pending') : t('xlsx')}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => download('pdf')}
        disabled={pending !== null}
      >
        {pending === 'pdf' ? t('pending') : t('pdf')}
      </Button>
    </div>
  );
}

function filenameFrom(res: Response): string | null {
  const header = res.headers.get('content-disposition') ?? '';
  return /filename="([^"]+)"/.exec(header)?.[1] ?? null;
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked on the next tick rather than synchronously: Safari starts reading
  // the blob URL only after the click handler returns.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
