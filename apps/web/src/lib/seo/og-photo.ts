/**
 * La foto de la subasta para la vista previa social, como data URI.
 *
 * El renderizador de imágenes detrás de next/og dibuja JPEG y PNG; desde el
 * 2026-09-26 las miniaturas son WebP, así que la llamada pasa la foto original.
 * Todo lo que no puede dibujar — WebP, HEIC, un archivo faltante, un error de red —
 * devuelve null y la tarjeta sale solo con texto en lugar de fallar.
 */
export async function photoDataUri(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return null;
    const type = (res.headers.get('content-type') ?? '').split(';')[0]!.trim();
    if (type !== 'image/jpeg' && type !== 'image/png') return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    // Pasado los 4 MB la tarjeta tarda demasiado en renderizarse para un despliegue en chat.
    if (bytes.length > 4 * 1024 * 1024) return null;
    return `data:${type};base64,${bytes.toString('base64')}`;
  } catch {
    return null;
  }
}
