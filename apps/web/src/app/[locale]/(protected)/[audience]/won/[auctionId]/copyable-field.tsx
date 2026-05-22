'use client';
import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Bank-detail row with a one-tap copy button. Used in the won-auction
 * detail page so the buyer can grab the account number without scrubbing
 * across a long string. Reverts the icon back to the copy glyph after
 * 1.5s so the affordance keeps inviting further copies.
 */
export function CopyableField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copiado`);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('No se pudo copiar');
    }
  }
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-[0.1em] text-text-muted">{label}</p>
        <p className="text-sm text-text-strong font-medium truncate select-all">{value}</p>
      </div>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copiar ${label}`}
        className="shrink-0 w-9 h-9 rounded-lg grid place-items-center text-text-muted hover:text-text-strong hover:bg-bg-deep/60 transition-colors"
      >
        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
      </button>
    </div>
  );
}
