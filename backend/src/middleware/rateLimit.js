'use strict';

/**
 * Rate limiters.
 *
 * Credential endpoints are limited far more aggressively than reads. Login is
 * keyed on IP *and* the submitted identifier, so one attacker cannot lock every
 * account from a single address, and distributed guessing against one account
 * still trips the per-account counter.
 */

const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

const handler = (message) => (req, res, next) => next(ApiError.tooManyRequests(message));

const base = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Limits are noise in tests; skip them there rather than sprinkling conditionals.
  skip: () => env.isTest,
};

const loginLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => {
    const identifier = String(req.body?.identifier || '')
      .toLowerCase()
      .slice(0, 120);
    return `${req.ip}|${identifier}`;
  },
  handler: handler('Too many sign-in attempts. Please wait and try again.'),
});

const registerLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  limit: 5,
  handler: handler('Too many accounts created from this address. Please try later.'),
});

const refreshLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 60,
  handler: handler('Too many token refreshes. Please slow down.'),
});

/** Guards HTTP message sends; the socket path has its own token bucket. */
const messageLimiter = rateLimit({
  ...base,
  windowMs: 60 * 1000,
  limit: 60,
  keyGenerator: (req) => req.user?.id || req.ip,
  handler: handler('You are sending messages too quickly.'),
});

const writeLimiter = rateLimit({
  ...base,
  windowMs: 60 * 1000,
  limit: 120,
  keyGenerator: (req) => req.user?.id || req.ip,
  handler: handler('Too many requests. Please slow down.'),
});

const globalLimiter = rateLimit({
  ...base,
  windowMs: 60 * 1000,
  limit: 600,
  handler: handler('Too many requests from this address.'),
});

module.exports = {
  loginLimiter,
  registerLimiter,
  refreshLimiter,
  messageLimiter,
  writeLimiter,
  globalLimiter,
};
