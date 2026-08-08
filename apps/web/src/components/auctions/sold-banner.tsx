interface Props {
  /** `card` = diagonal sobre la foto; `detail` = barra de ancho completo. */
  variant: 'card' | 'detail';
}

/**
 * Marca VENDIDO.
 *
 * Se muestra igual para `sold` y `sold_offline`: un auto vendido es un auto
 * vendido, y distinguir el canal en la vitrina no le sirve a nadie de afuera.
 * La diferencia sólo importa en los reportes.
 */
export function SoldBanner({ variant }: Props) {
  if (variant === 'detail') {
    return (
      <div
        role="status"
        className="w-full rounded-xl bg-rose-600 px-4 py-3 text-center text-lg font-bold uppercase tracking-[0.2em] text-white"
      >
        Vendido
      </div>
    );
  }
  return (
    <>
      {/* The ribbon below is aria-hidden — its rotated, absolutely-positioned
          markup reads as noise out of context for a screen reader, and the
          card's StatusBadge only ever announces "Finalizada"/"En vivo", which
          doesn't distinguish a sale from an unsold, closed auction. This is
          the actual accessible announcement that the unit is sold, so the
          state doesn't depend on seeing the red ribbon at all. */}
      <span className="sr-only">Vendido</span>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className={
            'absolute left-[-30%] top-[38%] w-[160%] rotate-[-12deg] ' +
            'bg-rose-600/95 py-1.5 text-center text-sm font-bold uppercase ' +
            'tracking-[0.25em] text-white shadow-lg'
          }
        >
          Vendido
        </div>
      </div>
    </>
  );
}
