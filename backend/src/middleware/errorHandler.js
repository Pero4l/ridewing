'use strict';

/**
 * Central error handler.
 *
 * Two rules govern everything here:
 *   1. Only `ApiError` messages reach the client. Anything else becomes a generic
 *      500 so stack traces, SQL and internal paths never leak.
 *   2. Nothing sensitive is logged — the logger's redaction list covers tokens and
 *      passwords, and we never log the raw request body on error.
 */

const { ValidationError, UniqueConstraintError, ForeignKeyConstraintError, DatabaseError } =
  require('sequelize');

const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const env = require('../config/env');

/** Maps a unique-constraint violation onto the field a user can actually fix. */
function describeUniqueViolation(error) {
  const constraint = error.parent?.constraint || '';

  if (constraint.includes('username')) return 'That username is already taken';
  if (constraint.includes('email')) return 'An account with that email already exists';
  if (constraint.includes('phone')) return 'An account with that phone number already exists';
  if (constraint.includes('communities_slug')) return 'A community with that name already exists';
  if (constraint.includes('follows_follower_following')) return 'You already follow that rider';
  if (constraint.includes('community_members_community_user')) return 'Already a member of this community';
  if (constraint.includes('community_follows_community_user')) return 'Already following this community';
  if (constraint.includes('one_pending')) return 'You already have a pending request for this community';
  if (constraint.includes('single_owner')) return 'This community already has an owner';
  if (constraint.includes('ride_participants_ride_user')) return 'Already joined this ride';
  if (constraint.includes('invite_code')) return 'Could not allocate an invite code, please retry';

  return 'That record already exists';
}

function normalize(error) {
  if (error instanceof ApiError) return error;

  // Model-level validation (Sequelize `validate` blocks).
  if (error instanceof ValidationError && !(error instanceof UniqueConstraintError)) {
    return ApiError.badRequest('Validation failed', {
      code: 'VALIDATION_ERROR',
      details: error.errors.map((item) => ({ field: item.path, message: item.message })),
    });
  }

  if (error instanceof UniqueConstraintError) {
    return ApiError.conflict(describeUniqueViolation(error), { code: 'CONFLICT' });
  }

  if (error instanceof ForeignKeyConstraintError) {
    return ApiError.badRequest('Referenced record does not exist', { code: 'INVALID_REFERENCE' });
  }

  // CHECK constraints surface here; the message names the constraint, not user data.
  if (error instanceof DatabaseError && error.parent?.code === '23514') {
    return ApiError.badRequest('That change violates a data rule', { code: 'CHECK_VIOLATION' });
  }

  // Body parser rejections.
  if (error.type === 'entity.too.large') {
    return ApiError.payloadTooLarge('Request body is too large');
  }
  if (error.type === 'entity.parse.failed') {
    return ApiError.badRequest('Request body is not valid JSON');
  }

  if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
    return ApiError.unauthorized('Invalid or expired token', { code: 'INVALID_TOKEN' });
  }

  return ApiError.internal();
}

// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity.
function errorHandler(error, req, res, next) {
  const apiError = normalize(error);

  const context = {
    method: req.method,
    path: req.originalUrl,
    statusCode: apiError.statusCode,
    userId: req.user?.id,
    requestId: req.id,
  };

  if (apiError.statusCode >= 500) {
    logger.error({ ...context, err: error }, 'request failed');
  } else {
    logger.warn({ ...context, reason: apiError.message }, 'request rejected');
  }

  const body = {
    error: {
      message: apiError.expose ? apiError.message : 'Internal server error',
      code: apiError.code || undefined,
      details: apiError.details || undefined,
    },
  };

  // Stacks are for developers, never for production clients.
  if (!env.isProduction && apiError.statusCode >= 500) {
    body.error.stack = error.stack;
  }

  res.status(apiError.statusCode).json(body);
}

module.exports = errorHandler;
module.exports.normalize = normalize;
