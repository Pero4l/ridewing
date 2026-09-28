'use strict';

/**
 * Video poster derivation.
 *
 * A video post with no `poster` renders as a black rectangle in the feed, which
 * is the bug this logic exists to fix. The poster is derived from the video URL
 * rather than stored, so that posts uploaded before the feature still get a
 * thumbnail without a data backfill.
 *
 * The transformation segments have to be inserted *before* the version id;
 * appending them produces a 404 that only ever shows up as a silently missing
 * image, so the exact URL shape is asserted here.
 */

const { derivePosterUrl, withPosters } = require('../src/services/media.service');

const CLOUD = 'https://res.cloudinary.com/ridewing/video/upload';

describe('derivePosterUrl', () => {
  it('inserts the transformation before the version id', () => {
    const poster = derivePosterUrl(`${CLOUD}/v1699999999/rider-clips-1700000000.mp4`);
    expect(poster).toBe(
      `${CLOUD}/w_640,so_1,q_auto,f_auto/v1699999999/rider-clips-1700000000.jpg`,
    );
  });

  it('keeps an existing upload transformation in front of the new one', () => {
    const poster = derivePosterUrl(`${CLOUD}/w_1280,c_scale,q_auto,f_mp4/v1/abc-123.mp4`);
    expect(poster).toBe(
      `${CLOUD}/w_640,so_1,q_auto,f_auto/w_1280,c_scale,q_auto,f_mp4/v1/abc-123.jpg`,
    );
  });

  it('replaces only the container extension, not dots in the public id', () => {
    const poster = derivePosterUrl(`${CLOUD}/v1/my.clip.name.mov`);
    expect(poster).toBe(`${CLOUD}/w_640,so_1,q_auto,f_auto/v1/my.clip.name.jpg`);
  });

  it('preserves a query string', () => {
    const poster = derivePosterUrl(`${CLOUD}/v1/clip.mp4?a=b`);
    expect(poster).toBe(`${CLOUD}/w_640,so_1,q_auto,f_auto/v1/clip.jpg?a=b`);
  });

  it('returns null for images', () => {
    expect(derivePosterUrl('https://res.cloudinary.com/ridewing/image/upload/v1/photo.jpg')).toBeNull();
  });

  it('returns null for video on another host, rather than guessing a transform', () => {
    expect(derivePosterUrl('https://cdn.example.com/videos/clip.mp4')).toBeNull();
  });

  it('returns null for a Cloudinary URL that is not an upload', () => {
    expect(derivePosterUrl('https://res.cloudinary.com/ridewing/video/fetch/v1/clip.mp4')).toBeNull();
  });

  it('returns null for garbage', () => {
    expect(derivePosterUrl('not a url')).toBeNull();
    expect(derivePosterUrl('')).toBeNull();
  });
});

describe('withPosters', () => {
  it('adds a poster to videos and leaves images alone', () => {
    const result = withPosters([
      { url: `${CLOUD}/v1/a.mp4`, type: 'video' },
      { url: 'https://res.cloudinary.com/ridewing/image/upload/v1/b.jpg', type: 'image' },
    ]);
    expect(result[0].posterUrl).toBe(`${CLOUD}/w_640,so_1,q_auto,f_auto/v1/a.jpg`);
    expect(result[1].posterUrl).toBeUndefined();
    // The image must not gain a key it never had.
    expect(Object.keys(result[1])).toEqual(['url', 'type']);
  });

  it('does not overwrite a poster the uploader already recorded', () => {
    const result = withPosters([
      { url: `${CLOUD}/v1/a.mp4`, type: 'video', posterUrl: 'https://cdn.example.com/kept.jpg' },
    ]);
    expect(result[0].posterUrl).toBe('https://cdn.example.com/kept.jpg');
  });

  it('does not mutate the input', () => {
    const input = [{ url: `${CLOUD}/v1/a.mp4`, type: 'video' }];
    withPosters(input);
    expect(input[0].posterUrl).toBeUndefined();
  });

  it('tolerates an empty list', () => {
    expect(withPosters([])).toEqual([]);
    expect(withPosters(undefined)).toEqual([]);
  });
});
