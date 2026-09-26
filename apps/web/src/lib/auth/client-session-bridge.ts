export interface BridgeDeps {
  auth: { authStateReady(): Promise<void>; readonly currentUser: { uid: string } | null };
  fetchImpl: typeof fetch;
  signIn: (customToken: string) => Promise<unknown>;
}

/**
 * Deja al SDK de Firebase del navegador con el mismo usuario que la cookie
 * de sesión del servidor. Devuelve `true` si al terminar hay usuario en el
 * cliente (y coincide con `expectedUid` cuando se pasa).
 *
 * Si el cliente ya tiene al usuario correcto no hace ninguna llamada de red:
 * ese es el caso normal, y cuesta lo que tarda `authStateReady()`. Sólo
 * cuando falta —o es otro— pide un custom token a /api/session/client-token y
 * entra con él. Ver lib/auth/client-token.ts para el porqué.
 *
 * Nunca lanza: quien llama trata `false` como "sin sesión en el cliente".
 */
export async function bridgeClientAuth(
  expectedUid: string | undefined,
  deps: BridgeDeps,
): Promise<boolean> {
  try {
    await deps.auth.authStateReady();
    const current = deps.auth.currentUser;
    if (current && (!expectedUid || current.uid === expectedUid)) return true;

    const res = await deps.fetchImpl('/api/session/client-token', { method: 'POST' });
    if (!res.ok) return false;
    const body = (await res.json()) as { token?: unknown; uid?: unknown };
    if (typeof body.token !== 'string') return false;
    if (expectedUid && body.uid !== expectedUid) return false;
    await deps.signIn(body.token);
    return true;
  } catch {
    return false;
  }
}
