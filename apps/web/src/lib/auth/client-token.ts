import type { Auth } from 'firebase-admin/auth';

export type ClientTokenResult =
  | { status: 200; body: { token: string; uid: string } }
  | { status: 401; body: { error: 'no_session' | 'invalid_session' } };

/**
 * Canjea la cookie de sesión del servidor por un custom token de Firebase,
 * para que el navegador vuelva a tener su parte de la sesión.
 *
 * Por qué hace falta: el servidor decide quién está adentro mirando sólo la
 * cookie httpOnly `__session`, pero las funciones callables (`placeBid`,
 * `buyNow`, `savePushToken`…) viajan con el ID token del SDK de Firebase del
 * navegador. Las dos mitades pueden separarse: en iPhone, una web agregada a
 * la pantalla de inicio arranca con la cookie pero con su propio
 * almacenamiento vacío, así que la página protegida se ve bien y cada llamada
 * sale sin usuario. En producción eso fue el 401 de `savePushToken` del
 * 2026-09-25 (iOS 18.7): "No se pudieron activar las notificaciones".
 *
 * `verifySessionCookie(…, true)` también rechaza cuentas deshabilitadas y
 * sesiones revocadas, así que este canje nunca revive una sesión que el
 * servidor ya no aceptaría. El custom token hereda los claims (rol, estado)
 * del usuario, así que las reglas y las callables ven lo mismo que antes.
 */
export async function mintClientToken(
  cookie: string | undefined,
  auth: Pick<Auth, 'verifySessionCookie' | 'createCustomToken'>,
): Promise<ClientTokenResult> {
  if (!cookie) return { status: 401, body: { error: 'no_session' } };
  let uid: string;
  try {
    uid = (await auth.verifySessionCookie(cookie, true)).uid;
  } catch {
    return { status: 401, body: { error: 'invalid_session' } };
  }
  const token = await auth.createCustomToken(uid);
  return { status: 200, body: { token, uid } };
}
