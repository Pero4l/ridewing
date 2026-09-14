'use strict';

/**
 * Request validation.
 *
 * Every mutating endpoint runs its input through a Zod schema before a controller
 * sees it. Validated output *replaces* `req.body`/`req.query`/`req.params`, so
 * unknown keys are stripped and a client cannot smuggle extra fields (e.g. `role`)
 * into a downstream `create`.
 */

const { ZodError } = require('zod');
const ApiError = require('../utils/ApiError');

function formatIssues(error) {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

/**
 * @param {{body?: import('zod').ZodTypeAny, query?: import('zod').ZodTypeAny, params?: import('zod').ZodTypeAny}} schemas
 */
module.exports = function validate(schemas) {
  return function validateRequest(req, res, next) {
    try {
      if (schemas.params) req.params = schemas.params.parse(req.params);
      if (schemas.query) req.validatedQuery = schemas.query.parse(req.query);
      if (schemas.body) req.body = schemas.body.parse(req.body ?? {});
      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        return next(
          ApiError.badRequest('Validation failed', {
            code: 'VALIDATION_ERROR',
            details: formatIssues(error),
          }),
        );
      }
      return next(error);
    }
  };
};

module.exports.formatIssues = formatIssues;
