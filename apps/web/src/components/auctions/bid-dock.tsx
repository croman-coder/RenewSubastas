'use client';
import { useState, type ReactNode } from 'react';
import { Gavel, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BottomSheet, BottomSheetContent } from '@/components/ui/bottom-sheet';
import type { DockState } from '@/lib/auctions/dock-state';
import { formatAmount } from '@/lib/format/money';
import { formatClock } from '@/lib/format/remaining';

interface Props {
  state: DockState;
  /** Título de la hoja, p. ej. "Pujar · Toyota Hilux 2019". */
  sheetTitle: string;
  /**
   * El BidPanel de siempre, montado dentro de la hoja. Recibe `close` para
   * pasárselo como onBidPlaced: la hoja se cierra sola cuando la puja entra.
   */
  renderPanel: (close: () => void) => ReactNode;
}

/**
 * Barra fija de puja de la ficha en el celular (spec 2026-09-27 §5.4). Mide
 * lo mismo que la barra de pestañas (64 px + área segura), así el lugar que
 * AppShell deja abajo le sirve igual. Solo por debajo de lg: en escritorio el
 * panel sigue en la columna derecha.
 *
 * El panel de la hoja solo existe con la hoja abierta (Radix desmonta el
 * contenido al cerrar), así que nunca hay dos confirmaciones vivas a la vez;
 * los datos en vivo vienen del onSnapshot del padre, no del panel.
 */
export function BidDock({ state, sheetTitle, renderPanel }: Props) {
  const [open, setOpen] = useState(false);
  if (state.kind === 'hidden') return null;

  return (
    <>
      <section
        aria-label="Barra de puja"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-text-subtle/15 bg-bg-elev pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4">
          <div className="min-w-0">
            {state.kind === 'bid' && (
              <>
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                  Tu próxima puja
                </p>
                <p className="num-tab truncate text-lg font-extrabold tracking-tight text-text-strong">
                  USD {formatAmount(state.amountUsd)}
                </p>
              </>
            )}
            {state.kind === 'winning' && (
              <>
                <p className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-success">
                  <Trophy className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
                  Vas ganando
                </p>
                <p className="num-tab truncate text-lg font-extrabold tracking-tight text-text-strong">
                  USD {formatAmount(state.amountUsd)}
                </p>
              </>
            )}
            {state.kind === 'scheduled' && (
              <>
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                  Abre en
                </p>
                <p
                  suppressHydrationWarning
                  className="num-tab text-lg font-extrabold tracking-tight text-text-strong"
                >
                  {formatClock(state.opensInMs)}
                </p>
              </>
            )}
          </div>
          {state.kind === 'bid' && (
            <Button
              type="button"
              size="lg"
              className="h-12 shrink-0 px-6 text-base"
              onClick={() => setOpen(true)}
            >
              <Gavel strokeWidth={2.5} aria-hidden="true" /> Pujar
            </Button>
          )}
        </div>
      </section>

      <BottomSheet open={open} onOpenChange={setOpen}>
        <BottomSheetContent title={sheetTitle}>
          {renderPanel(() => setOpen(false))}
        </BottomSheetContent>
      </BottomSheet>
    </>
  );
}
