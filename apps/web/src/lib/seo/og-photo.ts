/**
 * The auction photo for the social preview, as a data URI.
 *
 * The image renderer behind next/og draws JPEG and PNG; thumbnails are WebP
 * since 2026-09-26, so the caller passes the original photo. Anything it
 * cannot draw — WebP, HEIC, a missing file, a network error — returns null
 * and the card goes out text-only instead of failing.
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
    // Past 4 MB the card takes too long to render for a chat unfurl.
    if (bytes.length > 4 * 1024 * 1024) return null;
    return `data:${type};base64,${bytes.toString('base64')}`;
  } catch {
    return null;
  }
}
