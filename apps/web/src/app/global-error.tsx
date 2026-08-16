'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Última red de contención del cliente. Reemplaza al layout raíz, así que acá
 * no hay proveedores, ni traducciones, ni la hoja de estilos de la app: todo
 * va en línea o no va.
 *
 * Antes mostraba el error crudo de Next —"Application error: a client-side
 * exception has occurred (see the browser console for more information)"—, en
 * inglés y sin ninguna salida. En un celular eso es un callejón: no hay
 * consola que mirar y no hay botón que tocar. La única opción era cerrar.
 *
 * Esto no arregla ninguna de las causas; las excepciones que llegan hasta acá
 * siguen siendo bugs y siguen yendo a Sentry. Lo que cambia es que ahora se
 * puede volver: `reset()` reintenta el render que falló, y si eso tampoco
 * alcanza queda el enlace al inicio. La mayoría de lo que aterriza en esta
 * pantalla es un fallo de red momentáneo, y para eso reintentar suele bastar.
 */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: '24px',
          background: '#0b0b0c',
          color: '#f4f4f5',
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        }}
      >
        <main style={{ maxWidth: '28rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.375rem', fontWeight: 700, margin: '0 0 12px' }}>
            Algo se rompió de este lado
          </h1>
          <p style={{ margin: '0 0 24px', lineHeight: 1.6, color: '#a1a1aa' }}>
            No pudimos mostrar esta pantalla. Suele ser un problema momentáneo de conexión: probá de
            nuevo y en general vuelve a funcionar.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={reset}
              style={{
                appearance: 'none',
                border: 0,
                borderRadius: '12px',
                padding: '12px 20px',
                fontSize: '0.95rem',
                fontWeight: 600,
                cursor: 'pointer',
                background: '#c2703d',
                color: '#fff',
              }}
            >
              Reintentar
            </button>
            <a
              href="/es"
              style={{
                borderRadius: '12px',
                padding: '12px 20px',
                fontSize: '0.95rem',
                fontWeight: 600,
                textDecoration: 'none',
                border: '1px solid rgba(244,244,245,0.25)',
                color: '#f4f4f5',
              }}
            >
              Ir al inicio
            </a>
          </div>
          {error.digest && (
            // Sirve para cruzar el reporte de alguien con la incidencia en
            // Sentry sin pedirle que abra la consola del navegador.
            <p style={{ marginTop: '24px', fontSize: '0.75rem', color: '#71717a' }}>
              Código: {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
