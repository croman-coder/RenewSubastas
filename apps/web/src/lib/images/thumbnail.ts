/**
 * Vehicle photo thumbnails.
 *
 * Until 2026-09-26 `thumbnailUrl` was the original upload itself: every card
 * in the catalog downloaded a full phone photo (1080×1350 JPEG, ~680 KB) to
 * show it at ~340 px, and the public landing weighed 5,3 MB on mobile and
 * 14 MB on desktop (auditoría). Thumbnails are now a separate, small file
 * produced when staff uploads the photo (make-thumbnail.ts, in the browser)
 * and, for photos uploaded before that, by functions/scripts/backfill-thumbnails.ts.
 *
 * The thumbnail's path derives from the original's, so removing a photo can
 * remove its thumbnail without storing a second path in the vehicle doc.
 */

/** 800 px wide stays sharp on a phone card at 2–3× density. */
export const THUMB_MAX_WIDTH = 800;

export type ThumbExt = 'webp' | 'jpg';

/** Scale to at most `maxWidth` wide, keeping proportions. Never enlarges. */
export function fitWithin(
  width: number,
  height: number,
  maxWidth: number,
): { width: number; height: number } {
  if (width <= maxWidth) return { width, height };
  return { width: maxWidth, height: Math.round((height * maxWidth) / width) };
}

/** vehicles/{id}/{name}.jpg → vehicles/{id}/thumbs/{name}.{ext} */
export function thumbnailPathFor(originalPath: string, ext: ThumbExt): string {
  const slash = originalPath.lastIndexOf('/');
  const dir = originalPath.slice(0, slash);
  const file = originalPath.slice(slash + 1);
  const dot = file.lastIndexOf('.');
  const base = dot > 0 ? file.slice(0, dot) : file;
  return `${dir}/thumbs/${base}.${ext}`;
}

/** Every thumbnail an original can have (WebP, or JPEG where WebP isn't encodable). */
export function thumbnailPathsFor(originalPath: string): string[] {
  return [thumbnailPathFor(originalPath, 'webp'), thumbnailPathFor(originalPath, 'jpg')];
}
