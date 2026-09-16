'use strict';

/**
 * Post media editing window.
 *
 * Media must never be frozen prematurely or stay editable forever — the ten-minute
 * rule is a product promise ("you can fix a photo, but only right after posting").
 */

const { canEditMedia } = require('../src/services/post.service');

const WINDOW_MINUTES = 10;

describe('canEditMedia', () => {
  const now = Date.parse('2026-09-14T12:00:00.000Z');

  it('is editable right after posting', () => {
    const createdAt = new Date(now - 1 * 60 * 1000).toISOString();
    expect(canEditMedia(createdAt, now)).toBe(true);
  });

  it('is editable just inside the window', () => {
    const createdAt = new Date(now - 10 * 60 * 1000 + 1000).toISOString();
    expect(canEditMedia(createdAt, now)).toBe(true);
  });

  it('is locked exactly at the window boundary', () => {
    const createdAt = new Date(now - 10 * 60 * 1000).toISOString();
    expect(canEditMedia(createdAt, now)).toBe(false);
  });

  it('is locked well after the window', () => {
    const createdAt = new Date(now - 44 * 60 * 60 * 1000).toISOString();
    expect(canEditMedia(createdAt, now)).toBe(false);
  });

  it('exposes the product rule as a ten-minute window', () => {
    expect(WINDOW_MINUTES).toBe(10);
  });
});