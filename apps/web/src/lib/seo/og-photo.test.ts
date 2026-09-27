import { describe, expect, it } from 'vitest';
import { photoDataUri } from './og-photo';

const fakeFetch = (type: string, status = 200, body = new Uint8Array([1, 2, 3])) =>
  (async () =>
    new Response(body, { status, headers: { 'content-type': type } })) as unknown as typeof fetch;

describe('photoDataUri', () => {
  it('embeds a JPEG as a data URI', async () => {
    expect(await photoDataUri('https://img.test/a.jpg', fakeFetch('image/jpeg'))).toBe(
      'data:image/jpeg;base64,AQID',
    );
  });

  it('gives up on formats the image renderer cannot draw', async () => {
    expect(await photoDataUri('https://img.test/a.webp', fakeFetch('image/webp'))).toBeNull();
  });

  it('gives up when the photo is missing', async () => {
    expect(await photoDataUri('https://img.test/a.jpg', fakeFetch('image/jpeg', 404))).toBeNull();
  });

  it('gives up when the network fails', async () => {
    const failing = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await photoDataUri('https://img.test/a.jpg', failing)).toBeNull();
  });

  it('gives up when the photo is too heavy for a chat preview', async () => {
    const big = new Uint8Array(4 * 1024 * 1024 + 1);
    expect(
      await photoDataUri('https://img.test/a.jpg', fakeFetch('image/jpeg', 200, big)),
    ).toBeNull();
  });
});
