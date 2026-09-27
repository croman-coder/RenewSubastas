'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Hoja desde abajo para el celular (spec 2026-09-27 §3). Es un Dialog de
 * Radix con otra forma: foco atrapado, Escape, scroll de fondo bloqueado y un
 * Dialog anidado (la confirmación de puja de BidPanel) apilado encima vienen
 * gratis. El foco devuelto al cerrar NO viene gratis con cualquier botón:
 * Radix solo lo guarda y lo restaura si ese botón es un `BottomSheetTrigger`
 * (o `DialogPrimitive.Trigger`); con un `onClick` suelto que llama a
 * `onOpenChange(true)`, al cerrar el foco cae en `<body>`.
 *
 * Sólida (bg-elev), sin desenfoque: tinta y papel. Entra desde abajo con
 * ease-out y sin rebote (DESIGN.md: 200–400 ms). Se cierra con la X, tocando
 * afuera o con Escape; el gesto de deslizar quedó fuera de alcance (§8).
 */
const BottomSheet = DialogPrimitive.Root;

const BottomSheetTrigger = DialogPrimitive.Trigger;

const BottomSheetClose = DialogPrimitive.Close;

interface BottomSheetContentProps extends React.ComponentPropsWithoutRef<
  typeof DialogPrimitive.Content
> {
  /** Obligatorio: Radix lo usa como nombre accesible del diálogo. */
  title: string;
  description?: string | undefined;
}

const BottomSheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  BottomSheetContentProps
>(({ className, children, title, description, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:animate-none" />
    <DialogPrimitive.Content
      ref={ref}
      // Sin descripción, Radix avisa en consola salvo que se diga explícito.
      {...(description ? {} : { 'aria-describedby': undefined })}
      className={cn(
        'fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col',
        'rounded-t-[24px] border-t border-text-subtle/15 bg-bg-elev shadow-card',
        'pb-[env(safe-area-inset-bottom)] focus:outline-none',
        'duration-300 ease-out data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom',
        'motion-reduce:animate-none',
        className,
      )}
      {...props}
    >
      <div
        aria-hidden
        className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-text-subtle/40"
      />
      <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-3">
        <div className="min-w-0">
          <DialogPrimitive.Title className="text-base font-bold tracking-tight text-text-strong">
            {title}
          </DialogPrimitive.Title>
          {description && (
            <DialogPrimitive.Description className="mt-0.5 text-sm text-text-muted">
              {description}
            </DialogPrimitive.Description>
          )}
        </div>
        <DialogPrimitive.Close
          aria-label="Cerrar"
          className="-mr-1.5 grid h-11 w-11 shrink-0 place-items-center rounded-lg text-text-muted transition-colors hover:bg-bg-deep/60 hover:text-text-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-text-strong/40"
        >
          <X className="h-5 w-5" strokeWidth={2.25} />
        </DialogPrimitive.Close>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
BottomSheetContent.displayName = 'BottomSheetContent';

export { BottomSheet, BottomSheetTrigger, BottomSheetClose, BottomSheetContent };
