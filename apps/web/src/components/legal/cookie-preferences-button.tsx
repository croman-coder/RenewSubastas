'use client';
import { REOPEN_EVENT } from './cookie-banner';

/**
 * Footer entry point back into the cookie choice.
 *
 * The policy promises the visitor can change their mind "desde el enlace de
 * configuración de cookies en el pie de página", so this has to exist for
 * that sentence to be true.
 */
export function CookiePreferencesButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(REOPEN_EVENT))}
      className={
        'text-text-muted hover:text-text-strong transition-colors duration-200 rounded ' +
        '[touch-action:manipulation] focus:outline-none focus-visible:ring-2 focus-visible:ring-text-strong/40'
      }
    >
      Configurar cookies
    </button>
  );
}
