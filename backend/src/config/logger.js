'use strict';

/**
 * Application logger.
 *
 * Redaction is configured centrally so no call site can accidentally leak a
 * password, token or authorization header into the logs.
 */

const pino = require('pino');
const env = require('./env');

const REDACTED = '[REDACTED]';

const logger = pino({
  level: env.isTest ? 'silent' : env.logLevel,
  base: { service: 'ridewing-api' },
  redact: {
    paths: [
      'password',
      'newPassword',
      'currentPassword',
      'passwordHash',
      'token',
      'accessToken',
      'refreshToken',
      'credential',
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      'body.password',
      'body.newPassword',
      'body.currentPassword',
      'body.token',
      'body.refreshToken',
      '*.password',
      '*.passwordHash',
      '*.token',
      '*.accessToken',
      '*.refreshToken',
      '*.authorization',
    ],
    censor: REDACTED,
  },
  transport:
    env.isProduction || env.isTest
      ? undefined
      : {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,service' },
        },
});

module.exports = logger;
module.exports.REDACTED = REDACTED;
