'use strict';

/**
 * Wraps an async route handler so rejected promises reach the central error
 * handler instead of hanging the request.
 */
module.exports = function asyncHandler(handler) {
  return function wrapped(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
};
