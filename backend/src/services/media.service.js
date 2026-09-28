'use strict';

/**
 * Video poster frames.
 *
 * A `<video>` with no `poster` renders as a black rectangle until the first
 * frame decodes, which is why video posts looked like empty holes in the feed.
 * Cloudinary already has a still frame for every uploaded video — the only
 * missing part is asking for it — but a poster that is only recorded at upload
 * time would leave every existing post thumbnail-less.
 *
 * So posters are generated at upload time when the duration is known, and
 * derived on read for everything already in the database. Deriving is safe
 * because it is pure string work on a URL, needs no migration, and costs one
 * `<img>` that the browser caches like any other asset.
 */

/**
 * Cloudinary serves a JPEG still from a video by asking the same resource for a
 * different format. The `so_` seek is what makes it worth doing: frame zero of a
 * vertical ride clip is very often black, motion blur, or the rider's shadow.
 */
const POSTER_FORMAT = 'jpg';
const POSTER_WIDTH = 640;
const POSTER_SEEK_SECONDS = 1;

function isVideoUrl(url) {
  return /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i.test(url);
}

function baseBeforeExtension(url) {
  return url.replace(/\.(mp4|webm|mov|m4v|ogv)(\?.*)?$/i, '');
}

/** Strips a known container extension from the final path segment. */
function stripExtension(segment) {
  return segment.replace(/\.(mp4|webm|mov|m4v|ogv)$/i, '');
}

/**
 * Builds a poster URL from a Cloudinary video URL.
 *
 * Cloudinary transformations are path segments that must sit *before* the
 * version id, so the new segments are inserted at the head of the path rather
 * than appended — appending would silently produce a 404 that only shows up as a
 * missing thumbnail.
 *
 * Returns null for anything we do not recognise, so a non-Cloudinary or
 * third-party video simply renders with the CSS fallback instead of a broken
 * image icon.
 */
function derivePosterUrl(videoUrl) {
  if (typeof videoUrl !== 'string' || !isVideoUrl(videoUrl)) return null;

  let url;
  try {
    url = new URL(videoUrl);
  } catch {
    return null;
  }

  if (!/res\.cloudinary\.com$/.test(url.hostname) || !url.pathname.includes('/video/upload/')) return null;

  const segments = url.pathname.split('/');
  const uploadIndex = segments.indexOf('upload');
  // Guard against future path shapes rather than corrupting them.
  if (uploadIndex === -1 || uploadIndex + 1 >= segments.length) return null;

  const transformation = ['w_' + POSTER_WIDTH, 'so_' + POSTER_SEEK_SECONDS, 'q_auto', 'f_auto'].join(',');
  segments.splice(uploadIndex + 1, 0, transformation);
  // The public id keeps its own dots (file names may contain them), so only the
  // final container extension is replaced — never the whole id.
  const last = segments.length - 1;
  segments[last] = `${stripExtension(segments[last])}.${POSTER_FORMAT}`;
  url.pathname = segments.join('/');

  return url.toString();
}

/**
 * Returns the media list with a `posterUrl` filled in for every video.
 * Images are passed through untouched; an already-present poster is kept.
 */
function withPosters(media) {
  if (!Array.isArray(media) || media.length === 0) return media ?? [];
  return media.map((item) => {
    if (!item || item.type !== 'video') return item;
    if (item.posterUrl) return item;
    const posterUrl = derivePosterUrl(item.url);
    return posterUrl ? { ...item, posterUrl } : item;
  });
}

module.exports = { derivePosterUrl, withPosters, isVideoUrl, POSTER_SEEK_SECONDS, POSTER_WIDTH };
