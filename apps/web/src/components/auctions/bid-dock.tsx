'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Gavel, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BottomSheet, BottomSheetContent, BottomSheetTrigger } from '@/components/ui/bottom-sheet';
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
  // El botón "Pujar" (y por lo tanto el trigger de la hoja) solo existe con
  // state.kind === 'bid'. Si una puja entra y el estado pasa a 'winning', o si
  // el reloj del cliente se adelanta al del servidor y la barra pasa por
  // 'hidden' y vuelve a 'bid' (extensión anti-sniping), un `open` que había
  // quedado en true reabriría la hoja sola sin que nadie la haya tocado.
  useEffect(() => {
    if (state.kind !== 'bid') setOpen(false);
  }, [state.kind]);
  // Foco de respaldo cuando la hoja se cierra sin trigger vivo al que volver
  // (ver onCloseAutoFocus más abajo).
  const sectionRef = useRef<HTMLElement>(null);

  if (state.kind === 'hidden') return null;

  return (
    <BottomSheet open={open && state.kind === 'bid'} onOpenChange={setOpen}>
      <section
        ref={sectionRef}
        tabIndex={-1}
        aria-label="Barra de puja"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-text-subtle/15 bg-bg-elev pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4">
          {/* aria-live solo en bid/winning: si te superan mientras estás en la
              página, lo escuchás sin recargar (C4). En 'scheduled' el texto es
              un reloj que cambia cada segundo — anunciarlo sería ruido. */}
          <div className="min-w-0" aria-live={state.kind === 'scheduled' ? undefined : 'polite'}>
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
                {/* text-success da 4.46:1 en claro (bajo el 4.5:1 de AA):
                    mismo tono oscuro que usa el Badge success para el texto. */}
                <p className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#166534] dark:text-success">
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
            // asChild: Radix necesita ESTE botón como su propio trigger para
            // guardar la referencia y devolverle el foco al cerrar la hoja
            // (con un onClick suelto, como antes, Radix no sabe a quién
            // volver y el foco caía en <body>).
            <BottomSheetTrigger asChild>
              <Button type="button" size="lg" className="h-12 shrink-0 px-6 text-base">
                <Gavel strokeWidth={2.5} aria-hidden="true" /> Pujar
              </Button>
            </BottomSheetTrigger>
          )}
        </div>
      </section>

      <BottomSheetContent
        title={sheetTitle}
        onCloseAutoFocus={(e) => {
          // Si la puja entró mientras la hoja estaba abierta, el estado ya
          // pasó a 'winning' y el trigger de arriba se desmontó: Radix no
          // tiene dónde devolver el foco y lo dejaría en <body>. Lo mandamos
          // a la barra en su lugar.
          if (state.kind !== 'bid') {
            e.preventDefault();
            sectionRef.current?.focus();
          }
        }}
      >
        {renderPanel(() => setOpen(false))}
      </BottomSheetContent>
    </BottomSheet>
  );
}
