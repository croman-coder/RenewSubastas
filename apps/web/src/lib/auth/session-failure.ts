/**
 * Distingue una sesión que dejó de valer de una verificación que no se pudo
 * hacer. No es lo mismo y tratarlas igual es lo que echaba gente adentro.
 *
 * `verifySessionCookie(cookie, true)` no sólo valida la firma: el segundo
 * argumento la obliga a consultar a Google si la sesión fue revocada, o sea
 * una llamada de red en cada render de página protegida. Cuando esa llamada
 * falla —Google lento, arranque en frío, corte momentáneo— la excepción es
 * indistinguible, a simple vista, de una cookie vencida.
 *
 * Y el desenlace no era simétrico. Cualquier excepción mandaba a
 * `/login?error=expired`, y la pantalla de login borra la cookie ante ese
 * motivo. Un tropiezo de red de un segundo terminaba destruyendo una sesión
 * perfectamente válida de cinco días: eso es lo que se siente como
 * "actualizo la página y me saca".
 *
 * La regla acá es asimétrica a propósito. Para dar acceso hace falta prueba
 * positiva: sin verificar, nadie entra. Para destruir una sesión también hace
 * falta prueba positiva: sólo se borra cuando Firebase dijo explícitamente que
 * la credencial no sirve. La duda no destruye nada.
 */
export type SessionFailure = 'invalid' | 'temporary';

/**
 * Códigos con los que Firebase Admin afirma que la credencial no sirve.
 * Todo lo demás —`auth/internal-error`, fallas de red, lo que aparezca
 * mañana— es duda, y la duda no borra sesiones.
 */
const DEFINITIVE = new Set([
  'auth/session-cookie-expired',
  'auth/session-cookie-revoked',
  'auth/id-token-expired',
  'auth/id-token-revoked',
  'auth/user-disabled',
  'auth/user-not-found',
  // Cookie ausente, vacía o con formato inválido: no hay nada que preservar.
  'auth/argument-error',
]);

export function classifySessionFailure(err: unknown): SessionFailure {
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code !== 'string') return 'temporary';
  return DEFINITIVE.has(code) ? 'invalid' : 'temporary';
}
