'use client';
import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import { fb } from '@/lib/firebase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

// Confirmación tipeada, igual que el borrado de cuenta: cerrar una subasta
// con pujas activas no puede depender de un solo click.
const CONFIRM_WORD = 'VENDIDO';

interface Props {
  auctionId: string;
  bidCount: number;
  onDone: () => void;
}

/**
 * Registra la venta de una unidad fuera de la plataforma (venta en salón).
 * Llama a `markSoldOffline` — sólo admin/staff, sólo sobre subastas
 * `live`/`scheduled` — que cierra la subasta con outcome `sold_offline` y
 * avisa por correo a cada postor de que la unidad ya no está disponible.
 */
export function MarkSoldDialog({ auctionId, bidCount, onDone }: Props) {
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);

  const priceNumber = Number(price);
  const isPriceValid = price.trim() !== '' && Number.isFinite(priceNumber) && priceNumber > 0;
  const canSubmit = isPriceValid && confirmText === CONFIRM_WORD;

  function reset() {
    setPrice('');
    setConfirmText('');
  }

  function handleOpenChange(next: boolean) {
    if (!next && busy) return; // no cerrar en medio de la llamada
    setOpen(next);
    if (!next) reset();
  }

  async function handleConfirm() {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await httpsCallable(
        fb.functions,
        'markSoldOffline',
      )({ auctionId, soldPriceUsd: priceNumber });
      toast.success('Subasta marcada como vendida.');
      setOpen(false);
      reset();
      onDone();
    } catch (e) {
      toast.error((e as Error).message ?? 'No se pudo registrar la venta.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          Marcar vendido
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Marcar VENDIDO</DialogTitle>
          <DialogDescription>
            Registrá la venta de esta unidad fuera de la plataforma (venta en salón). Cierra la
            subasta de inmediato y no se puede deshacer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {bidCount > 0 && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/[0.08] px-4 py-3">
              <AlertTriangle
                className="w-4 h-4 mt-0.5 shrink-0 text-amber-400"
                aria-hidden="true"
              />
              <p className="text-sm text-amber-200/90">
                Esta subasta tiene <strong>{bidCount}</strong>{' '}
                {bidCount === 1 ? 'puja activa' : 'pujas activas'}. Al marcarla vendida, se les
                avisa por correo que la unidad se vendió en salón.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="sold-price">Precio real de venta (USD)</Label>
            <Input
              id="sold-price"
              type="number"
              min={1}
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              disabled={busy}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sold-confirm">
              Escribí <span className="font-mono">{CONFIRM_WORD}</span> para confirmar
            </Label>
            <Input
              id="sold-confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={CONFIRM_WORD}
              disabled={busy}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={!canSubmit || busy} onClick={handleConfirm}>
            {busy ? 'Marcando…' : 'Marcar vendido'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
