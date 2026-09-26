import { fitWithin, THUMB_MAX_WIDTH, type ThumbExt } from './thumbnail';

export interface Thumbnail {
  blob: Blob;
  ext: ThumbExt;
  contentType: string;
}

/**
 * Resize a photo in the browser before it goes to Storage (see thumbnail.ts).
 *
 * WebP when the browser can encode it, JPEG otherwise (Safari hands back a
 * PNG for image/webp, which is caught by checking the blob's type). Either
 * way the result is tens of KB instead of the original's hundreds.
 *
 * Returns null when the browser cannot decode the file — HEIC on Chrome, for
 * instance. The caller then keeps the original as its own thumbnail, as
 * before, rather than failing the whole upload over a nicety.
 */
export async function makeThumbnail(file: Blob): Promise<Thumbnail | null> {
  let bitmap: ImageBitmap;
  try {
    // from-image applies EXIF rotation, so a phone photo taken upright
    // doesn't come out sideways in the thumbnail while the original shows fine.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return null;
  }
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, THUMB_MAX_WIDTH);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);

    const webp = await toBlob(canvas, 'image/webp', 0.8);
    if (webp?.type === 'image/webp') return { blob: webp, ext: 'webp', contentType: 'image/webp' };
    const jpeg = await toBlob(canvas, 'image/jpeg', 0.82);
    return jpeg ? { blob: jpeg, ext: 'jpg', contentType: 'image/jpeg' } : null;
  } finally {
    bitmap.close();
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}
