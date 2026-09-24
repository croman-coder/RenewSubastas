import { isCredentialBearingPath } from './meta-pixel';

/**
 * Google Analytics 4 — propiedad "RENEW SUBASTAS PY" (cuenta de marketing).
 *
 * Hasta septiembre de 2026 el sitio no mandaba nada a Google: la variable
 * NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID no está cargada en Netlify y, aunque lo
 * estuviera, nadie llama a getAnalytics(). Por eso Google no detectó ninguna
 * etiqueta al crear el flujo de datos. Esta es la etiqueta, y es la única vía
 * por la que el sitio habla con GA.
 *
 * Mide igual que el Meta Pixel: desde la primera visita, sin esperar al aviso
 * de cookies. Las dos políticas (lib/legal/company-facts.ts) y el texto del
 * aviso lo dicen; si esto cambia, cambian ellos también.
 */
export const GA_MEASUREMENT_ID = 'G-3DR82WVEKL';

export const GTAG_SRC = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const LOCALES = new Set(['es', 'en']);

/** Pantallas del equipo, no de compradores: no se miden. */
const INTERNAL_SEGMENTS = new Set(['admin', 'staff', 'sales']);

/** `/es/admin/...`, `/staff`, etc. Con o sin prefijo de idioma. */
export function isInternalPath(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean);
  const first = LOCALES.has(segments[0] ?? '') ? segments[1] : segments[0];
  return first !== undefined && INTERNAL_SEGMENTS.has(first);
}

/**
 * Dónde GA no corre.
 *
 * - Rutas internas del equipo (admin, staff, sales).
 * - Páginas cuya URL lleva una credencial (reset de contraseña, oobCode de
 *   Firebase): gtag manda la URL completa como page_location, igual que Meta
 *   manda la suya, así que ahí entregaría el token. Misma regla y misma lista
 *   que el pixel — ver isCredentialBearingPath.
 */
export function isGoogleAnalyticsExcludedPath(pathname: string): boolean {
  return isInternalPath(pathname) || isCredentialBearingPath(pathname);
}

/**
 * Apaga o prende el envío sin sacar el script.
 *
 * La app es de una sola página: si gtag.js se cargó en /es/login y el usuario
 * entra a /es/admin, el script sigue ahí y la medición mejorada de GA manda un
 * page_view por cada cambio de historial. `ga-disable-<ID>` es el interruptor
 * oficial de Google y gtag lo consulta al procesar cada evento. Medido con
 * gtag.js real: el page_view de un cambio de historial se procesa entre 200 ms
 * y 1 s después del pushState, y un efecto de React corre en el mismo cuadro,
 * así que el interruptor llega antes.
 */
export function setGoogleAnalyticsDisabled(disabled: boolean): void {
  if (typeof window === 'undefined') return;
  (window as unknown as Record<string, unknown>)[`ga-disable-${GA_MEASUREMENT_ID}`] = disabled;
}

let initialized = false;

/**
 * Cola de gtag + `config`, una sola vez por pestaña.
 *
 * `config` manda el page_view de la página actual. Los siguientes los manda
 * la medición mejorada de GA ("cambios de página según el historial", activa
 * por defecto): NO agregar page_view manuales en los cambios de ruta, o cada
 * navegación se cuenta dos veces.
 */
export function initGoogleAnalytics(): void {
  if (typeof window === 'undefined' || initialized) return;
  initialized = true;
  window.dataLayer = window.dataLayer ?? [];
  if (typeof window.gtag !== 'function') {
    // gtag.js reproduce cada entrada como lista de argumentos: tiene que ser
    // el objeto `arguments`, no un array (la misma trampa del stub de Meta).
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
  }
  window.gtag('js', new Date());
  window.gtag('config', GA_MEASUREMENT_ID);
}

/** Evento de GA, sólo si gtag existe y la página actual se puede medir. */
export function trackGoogleEvent(name: string, params: Record<string, unknown> = {}): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  if (isGoogleAnalyticsExcludedPath(window.location.pathname)) return;
  window.gtag('event', name, params);
}

/**
 * Cuenta nueva confirmada por el backend. Se llama desde el mismo punto que el
 * CompleteRegistration de Meta (trackCompleteRegistration), que ya garantiza
 * que es un alta y no un inicio de sesión, y que sale una sola vez por cuenta.
 */
export function trackGoogleLead(method: 'email' | 'google'): void {
  trackGoogleEvent('generate_lead', { form: 'registro', method });
}

/**
 * Si `href` abre WhatsApp, la URL a reportar (sin query: `?text=` puede traer
 * el mensaje precargado). Si no, null.
 */
export function whatsappLinkUrl(href: string, base: string): string | null {
  let url: URL;
  try {
    url = new URL(href, base);
  } catch {
    return null;
  }
  if (url.protocol === 'whatsapp:') return 'whatsapp:';
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase();
  if (host === 'wa.me' || host === 'whatsapp.com' || host.endsWith('.whatsapp.com')) {
    return `${url.origin}${url.pathname}`;
  }
  return null;
}
