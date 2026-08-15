/**
 * Borra la cookie de sesión del servidor. Devuelve si realmente se borró.
 *
 * Existe como función aparte, y devolviendo un booleano en vez de lanzar,
 * porque de esa respuesta depende una decisión de seguridad y no un mensaje de
 * error: la cookie httpOnly es lo único que el servidor mira para decidir si
 * alguien está adentro. Mientras siga viva, la sesión sigue viva, por más que
 * el navegador ya haya olvidado su parte.
 *
 * Quien llama tiene que tratar `false` como "no se cerró nada" y dejar todo
 * como estaba. Lo contrario —seguir de largo y mandar al login— produce el peor
 * final posible: alguien convencido de que salió, con la sesión abierta. En un
 * celular prestado eso no es una molestia.
 *
 * Traga cualquier excepción a propósito. En iPhone con señal intermitente el
 * fetch falla con `TypeError: Load failed`, que es exactamente el caso que
 * esto tiene que manejar, no reportar.
 */
export async function clearServerSession(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl('/api/session', { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
}
