'use strict';

/**
 * Cursor pagination helpers.
 *
 * Chat history and follower lists are read far more often than they change, so
 * every list endpoint uses keyset pagination — stable under inserts and cheap
 * for Postgres to satisfy from an index.
 */

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

function normalizeLimit(value, fallback = DEFAULT_LIMIT) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, MAX_LIMIT);
}

/** Encodes an opaque cursor. Base64url keeps it URL-safe without extra escaping. */
function encodeCursor(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null; // A malformed cursor is treated as "start from the beginning".
  }
}

/**
 * Builds a page envelope from one extra fetched row, which tells us whether a
 * further page exists without a second COUNT query.
 */
function buildPage(rows, limit, toCursor) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return {
    items,
    pageInfo: {
      hasMore,
      nextCursor: hasMore && last ? encodeCursor(toCursor(last)) : null,
    },
  };
}

module.exports = {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  normalizeLimit,
  encodeCursor,
  decodeCursor,
  buildPage,
};
