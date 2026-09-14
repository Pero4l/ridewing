'use strict';

const crypto = require('crypto');

/** Converts a community name into a URL-safe slug. */
function slugify(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * Slugs must be unique, and two people can create "Sunday Riders" at once.
 * The caller supplies an existence check; we append a short random suffix until
 * we find a free slug rather than trusting a read-then-write race.
 */
async function uniqueSlug(name, exists) {
  const base = slugify(name) || 'community';
  if (!(await exists(base))) return base;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = `${base}-${crypto.randomBytes(3).toString('hex')}`;
    if (!(await exists(candidate))) return candidate;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

/** Short, unambiguous ride invite code (no look-alike characters). */
function inviteCode(length = 7) {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

module.exports = { slugify, uniqueSlug, inviteCode };
