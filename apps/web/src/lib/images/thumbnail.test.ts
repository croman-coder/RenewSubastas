import { describe, expect, it } from 'vitest';
import { fitWithin, thumbnailPathFor, thumbnailPathsFor, THUMB_MAX_WIDTH } from './thumbnail';

describe('fitWithin', () => {
  it('scales a portrait phone photo down to the card width, keeping proportions', () => {
    expect(fitWithin(1080, 1350, 800)).toEqual({ width: 800, height: 1000 });
  });

  it('scales a landscape photo down', () => {
    expect(fitWithin(4000, 3000, 800)).toEqual({ width: 800, height: 600 });
  });

  it('never enlarges a photo that is already small', () => {
    expect(fitWithin(640, 480, 800)).toEqual({ width: 640, height: 480 });
  });

  it('uses a width that stays sharp on a phone card', () => {
    expect(THUMB_MAX_WIDTH).toBe(800);
  });
});

describe('thumbnailPathFor', () => {
  it('puts the thumbnail in a thumbs/ folder next to the original', () => {
    expect(thumbnailPathFor('vehicles/abc123/1727400000000_k3j9x2.jpg', 'webp')).toBe(
      'vehicles/abc123/thumbs/1727400000000_k3j9x2.webp',
    );
  });

  it('handles originals without an extension', () => {
    expect(thumbnailPathFor('vehicles/abc123/foto', 'jpg')).toBe('vehicles/abc123/thumbs/foto.jpg');
  });
});

describe('thumbnailPathsFor', () => {
  it('lists every thumbnail an original may have, so deleting a photo leaves nothing behind', () => {
    expect(thumbnailPathsFor('vehicles/abc123/x.png')).toEqual([
      'vehicles/abc123/thumbs/x.webp',
      'vehicles/abc123/thumbs/x.jpg',
    ]);
  });
});
