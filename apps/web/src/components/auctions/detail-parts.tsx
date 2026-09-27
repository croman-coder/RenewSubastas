'use client';
import { useState } from 'react';
import { Clock } from 'lucide-react';

/**
 * Piezas de la ficha de subasta compartidas por la vista logueada y la
 * pública (spec 2026-09-26 §5). Solo presentación: quien las renderiza es
 * dueño del reloj y de los datos.
 */

export function AuctionGallery({
  images,
  alt,
}: {
  images: Array<{ url: string; thumbnailUrl: string }>;
  alt: string;
}) {
  const [active, setActive] = useState(0);
  const current = images[active];
  return (
    <div className="space-y-2">
      <div className="group aspect-[4/3] bg-bg-deep rounded-2xl overflow-hidden ring-1 ring-text-subtle/10 shadow-[0_24px_48px_-24px_rgba(0,0,0,0.5)]">
        {current ? (
          // La miniatura de 800 px alcanza y sobra para esta caja y pesa una
          // décima parte de la original, que queda a un clic para hacer zoom.
          <a
            href={current.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${alt} — ver foto en tamaño completo`}
          >
            <img
              src={current.thumbnailUrl}
              alt={alt}
              width={800}
              height={600}
              className="w-full h-full object-cover transition-transform duration-[600ms] ease-out group-hover:scale-[1.03] motion-reduce:transition-none"
            />
          </a>
        ) : (
          <div className="w-full h-full grid place-items-center text-text-subtle">sin fotos</div>
        )}
      </div>
      {images.length > 1 && (
        <div className="grid grid-cols-6 gap-2">
          {images.slice(0, 12).map((img, i) => (
            <button
              key={img.url}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Ver foto ${i + 1}`}
              className={
                'aspect-square rounded-lg overflow-hidden ring-2 transition-all duration-200 ' +
                (i === active
                  ? 'ring-text-strong scale-[0.98]'
                  : 'ring-transparent opacity-60 hover:opacity-100 hover:ring-text-subtle/30')
              }
            >
              <img
                src={img.thumbnailUrl}
                alt=""
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function SpecTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="hover-lift rounded-lg border border-text-subtle/10 bg-bg-elev px-3 py-2.5 hover:border-text-subtle/25 hover:bg-bg-elev/50">
      <dt className="text-text-muted text-[10px] uppercase tracking-[0.1em] font-semibold">
        {label}
      </dt>
      <dd className="text-text-strong text-sm mt-0.5 truncate">{value}</dd>
    </div>
  );
}

export function StatusChip({ status, label }: { status: string; label: string }) {
  // Tinte y borde con los tokens de estado de globals.css. El texto usa el
  // tono de DESIGN.md de cada estado (el mismo de los Badge): los tokens
  // success/warning/danger son tonos medios y sobre su propio tinte quedan
  // entre 2,5 y 3,8:1, poco para letra de 11 px. "Finalizada" va solo con
  // tokens neutros; antes era zinc-300 sobre papel (1,1:1) y ahora se ve en
  // las fichas públicas de autos vendidos. Todas las variantes quedan en
  // 5,2:1 o más, en claro y en oscuro (2026-09-26).
  const map: Record<string, string> = {
    live: 'bg-success/15 text-[#166534] ring-success/30 dark:text-[#bbf7d0]',
    scheduled: 'bg-warning/15 text-[#92400e] ring-warning/30 dark:text-[#fde68a]',
    ended: 'bg-text-subtle/15 text-text-muted ring-text-subtle/30',
    cancelled: 'bg-danger/15 text-[#991b1b] ring-danger/30 dark:text-[#fecaca]',
  };
  const cls = map[status] ?? map['ended']!;
  return (
    <span
      className={
        'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 ' +
        'text-[11px] uppercase tracking-[0.08em] font-semibold ' +
        'ring-1 ring-inset ' +
        cls
      }
    >
      {status === 'live' && (
        <span className="relative flex w-1.5 h-1.5">
          <span className="absolute inline-flex w-full h-full rounded-full bg-success/70 animate-ping" />
          <span className="relative inline-flex rounded-full w-1.5 h-1.5 bg-success" />
        </span>
      )}
      {label}
    </span>
  );
}

export function CountdownCard({
  label,
  remainingMs,
  urgent,
  critical,
  isLive,
}: {
  label: string;
  remainingMs: number;
  urgent: boolean;
  critical: boolean;
  isLive: boolean;
}) {
  const ended = remainingMs <= 0;
  const total = Math.max(0, Math.floor(remainingMs / 1000));
  const days = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  // La urgencia la lleva solo el color de los dígitos. Los halos, la línea con
  // degradé y la mancha desenfocada detrás del reloj se fueron con la
  // dirección A (DESIGN.md: superficies planas, una sola sombra suave, sin
  // brillos).
  const tone = ended
    ? 'text-text-muted'
    : critical
      ? 'text-rose-600 dark:text-rose-400'
      : urgent
        ? 'text-amber-700 dark:text-amber-300'
        : 'text-text-strong';
  return (
    <div className="relative overflow-hidden rounded-2xl border border-text-subtle/15 bg-bg-elev p-5 shadow-card">
      <div className="relative space-y-2">
        <div className="flex items-center gap-1.5">
          <Clock
            className={'w-3.5 h-3.5 ' + tone + (critical ? ' animate-pulse' : '')}
            strokeWidth={2.5}
          />
          <p className="text-[11px] uppercase tracking-[0.12em] font-semibold text-text-muted">
            {label}
          </p>
        </div>
        {ended ? (
          <p className="text-2xl font-bold tracking-tight text-text-muted num-tab">Finalizada</p>
        ) : (
          <div className="flex items-end gap-3 flex-wrap">
            {days > 0 && <DigitGroup value={days} unit="d" tone={tone} small />}
            <DigitGroup value={h} unit="h" tone={tone} />
            <DigitGroup value={m} unit="m" tone={tone} />
            <DigitGroup value={s} unit="s" tone={tone} pulsing={isLive && critical} />
          </div>
        )}
      </div>
    </div>
  );
}

function DigitGroup({
  value,
  unit,
  tone,
  small,
  pulsing,
}: {
  value: number;
  unit: string;
  tone: string;
  small?: boolean;
  pulsing?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-0.5">
      <span
        // El servidor y el navegador leen el reloj en momentos distintos
        // (mismo arreglo que BatchCountdown): el desajuste es esperable
        // solo en este elemento.
        suppressHydrationWarning
        className={
          'font-extrabold num-tab tracking-tight tabular-nums ' +
          (small ? 'text-3xl' : 'text-5xl sm:text-[3.5rem] sm:leading-[1]') +
          ' ' +
          tone +
          (pulsing ? ' animate-pulse' : '')
        }
      >
        {String(value).padStart(2, '0')}
      </span>
      <span className={'text-xs font-semibold uppercase tracking-wider ' + tone + '/70'}>
        {unit}
      </span>
    </div>
  );
}
