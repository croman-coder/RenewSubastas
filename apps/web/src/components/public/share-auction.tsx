'use client';
import { useState } from 'react';
import { Link2, Share2 } from 'lucide-react';
import { shareText, whatsappShareUrl } from '@/lib/share/whatsapp';

/**
 * Donde existe `navigator.share` (celulares y también algunas computadoras),
 * la hoja de compartir del sistema; donde no, wa.me en una pestaña nueva.
 * Copiar el link cubre todo lo demás.
 */
export function ShareAuction({ title, url }: { title: string; url: string }) {
  const [copied, setCopied] = useState(false);
  const text = shareText(title);

  async function share() {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      // `text` además de `title`: WhatsApp ignora el título y, sin texto, el
      // link llegaba solo, sin el "Mirá este … en subasta".
      // Una hoja cerrada sin elegir nada rechaza la promesa; no hay nada que recuperar.
      await navigator.share({ title: text, text, url }).catch(() => undefined);
      return;
    }
    window.open(whatsappShareUrl(text, url), '_blank', 'noopener,noreferrer');
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Portapapeles bloqueado (permisos, contexto inseguro): el botón de compartir sigue funcionando.
    }
  }

  const btn =
    'h-10 inline-flex items-center justify-center gap-1.5 rounded-lg border border-text-subtle/25 text-sm font-medium text-text-strong transition-colors hover:bg-bg-deep/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-text-strong/40';
  return (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={share} className={btn}>
        <Share2 className="w-4 h-4" aria-hidden="true" /> Compartir
      </button>
      <button type="button" onClick={copy} className={btn}>
        <Link2 className="w-4 h-4" aria-hidden="true" /> {copied ? 'Link copiado' : 'Copiar link'}
      </button>
    </div>
  );
}
