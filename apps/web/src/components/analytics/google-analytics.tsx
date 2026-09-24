'use client';
import { useEffect, useState } from 'react';
import Script from 'next/script';
import { usePathname } from 'next/navigation';
import {
  GTAG_SRC,
  initGoogleAnalytics,
  isGoogleAnalyticsExcludedPath,
  setGoogleAnalyticsDisabled,
  trackGoogleEvent,
  whatsappLinkUrl,
} from '@/lib/analytics/google-analytics';

/**
 * Etiqueta de Google (GA4) en todas las páginas públicas y de compradores.
 *
 * Va FUERA del <Suspense> de los otros trackers: sólo usa usePathname, y así
 * el servidor ya pinta el preload de gtag.js en el HTML de cada página
 * pública en lugar de esperar a que el cliente monte la frontera.
 *
 * En rutas internas y en las que llevan una credencial en la URL no se carga
 * (ver isGoogleAnalyticsExcludedPath). Si el script ya estaba cargado de una
 * página anterior, queda en la página pero apagado con ga-disable mientras se
 * esté en una de esas rutas.
 *
 * También reporta `click_whatsapp` con un solo listener delegado, para que
 * cualquier enlace a wa.me / whatsapp.com cuente sin tocar cada componente.
 */
export function GoogleAnalytics() {
  const pathname = usePathname();
  const excluded = isGoogleAnalyticsExcludedPath(pathname);
  // Una vez cargado, el script se queda: desmontarlo no lo descarga, y
  // volver a montarlo no debe volver a correr `config`.
  const [load, setLoad] = useState(!excluded);

  useEffect(() => {
    setGoogleAnalyticsDisabled(excluded);
    if (excluded) return;
    initGoogleAnalytics();
    setLoad(true);
  }, [excluded]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a[href]');
      if (!anchor) return;
      const linkUrl = whatsappLinkUrl(anchor.getAttribute('href') ?? '', window.location.href);
      if (linkUrl) trackGoogleEvent('click_whatsapp', { link_url: linkUrl });
    }
    // Captura: cuenta aunque el enlace o un padre corten la propagación.
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  return load ? <Script id="gtag-js" src={GTAG_SRC} strategy="afterInteractive" /> : null;
}
