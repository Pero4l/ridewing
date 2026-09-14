'use strict';

/**
 * Operational error carrying an HTTP status.
 *
 * Only errors created through this class have their message forwarded to clients;
 * anything else is reported as a generic 500 so internals never leak.
 */
class ApiError extends Error {
  constructor(statusCode, message, options = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = options.code || null;
    this.details = options.details || null;
    this.expose = true;
    Error.captureStackTrace(this, ApiError);
  }

  static badRequest(message = 'Bad request', options) {
    return new ApiError(400, message, options);
  }

  static unauthorized(message = 'Authentication required', options) {
    return new ApiError(401, message, options);
  }

  static forbidden(message = 'You do not have permission to do that', options) {
    return new ApiError(403, message, options);
  }

  static notFound(message = 'Not found', options) {
    return new ApiError(404, message, options);
  }

  static conflict(message = 'Conflict', options) {
    return new ApiError(409, message, options);
  }

  static payloadTooLarge(message = 'Payload too large', options) {
    return new ApiError(413, message, options);
  }

  static tooManyRequests(message = 'Too many requests', options) {
    return new ApiError(429, message, options);
  }

  static internal(message = 'Internal server error', options) {
    const error = new ApiError(500, message, options);
    error.expose = false;
    return error;
  }

  static serviceUnavailable(message = 'Service temporarily unavailable', options) {
    const error = new ApiError(503, message, options);
    error.expose = true;
    return error;
  }
}

module.exports = ApiError;
