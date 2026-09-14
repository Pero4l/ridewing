'use strict';

const ApiError = require('../utils/ApiError');

/** 404 for unmatched routes, so the client always gets the standard error shape. */
module.exports = function notFound(req, res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} does not exist`));
};
