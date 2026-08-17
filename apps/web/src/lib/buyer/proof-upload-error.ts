/**
 * Traduce la falla de una subida de comprobante a algo accionable.
 *
 * Antes el catch hacía `toast.error((e as Error).message)`, que a alguien
 * pagando una seña desde el celular le mostraba textos como "Firebase
 * Storage: User does not have permission to access 'payment-proofs/...'
 * (storage/unauthorized)". Ilegible, en inglés, y sin decir qué hacer.
 *
 * El reparto no es cosmético. `storage/unauthorized` y una caída de red
 * piden acciones opuestas —una hay que reportarla, la otra se resuelve
 * reintentando— y quien está del otro lado no puede distinguirlas si las dos
 * dicen "hubo un error".
 */
export function describeProofUploadError(err: unknown): string {
  const code = String((err as { code?: unknown } | null)?.code ?? '');
  const message = String((err as { message?: unknown } | null)?.message ?? '');

  // La regla del bucket rechazó la escritura. Casi siempre es el tipo de
  // archivo o que quien sube no figura como ganador de esa subasta: nada que
  // la persona pueda arreglar reintentando, así que se la manda a avisar.
  if (code.includes('storage/unauthorized') || message.includes('storage/unauthorized')) {
    return 'No pudimos guardar el archivo. Escribinos y lo cargamos por vos.';
  }
  if (code.includes('storage/quota-exceeded')) {
    return 'No pudimos guardar el archivo. Escribinos y lo cargamos por vos.';
  }
  if (code.includes('storage/retry-limit-exceeded') || code.includes('storage/canceled')) {
    return 'La subida se cortó. Probá de nuevo con mejor señal.';
  }
  if (
    code.includes('unavailable') ||
    code.includes('deadline-exceeded') ||
    message.includes('Load failed') ||
    message.includes('network')
  ) {
    return 'Se cortó la conexión antes de terminar. Probá de nuevo.';
  }
  if (code.includes('unauthenticated') || code.includes('permission-denied')) {
    return 'Tu sesión venció. Volvé a entrar y reintentá.';
  }
  return 'No pudimos enviar el comprobante. Probá de nuevo, y si sigue igual escribinos.';
}
