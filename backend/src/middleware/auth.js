'use strict';

/**
 * HTTP authentication.
 *
 * The access token arrives as a Bearer header only — never a query parameter,
 * which would end up in access logs and browser history.
 */

const { User } = require('../models');
const ApiError = require('../utils/ApiError');
const tokenService = require('../services/token.service');
const asyncHandler = require('../utils/asyncHandler');

function extractBearer(req) {
  const header = req.headers.authorization;
  if (!header || typeof header !== 'string') return null;
  const [scheme, value] = header.split(' ');
  if (!/^Bearer$/i.test(scheme) || !value) return null;
  return value.trim();
}

/** Rejects the request unless a valid access token maps to an existing rider. */
const requireAuth = asyncHandler(async (req, res, next) => {
  const token = extractBearer(req);
  if (!token) throw ApiError.unauthorized('Authentication required');

  const payload = tokenService.verifyAccessToken(token);

  // Load the user on every request so a deleted account cannot keep acting on a
  // token that has not expired yet.
  const user = await User.findByPk(payload.sub);
  if (!user) throw ApiError.unauthorized('Account no longer exists');

  req.user = user;
  return next();
});

/** Populates `req.user` when a token is present, but never rejects. */
const optionalAuth = asyncHandler(async (req, res, next) => {
  const token = extractBearer(req);
  if (!token) return next();
  try {
    const payload = tokenService.verifyAccessToken(token);
    req.user = await User.findByPk(payload.sub);
  } catch {
    req.user = undefined; // An invalid token is simply treated as anonymous here.
  }
  return next();
});

module.exports = { requireAuth, optionalAuth, extractBearer };
