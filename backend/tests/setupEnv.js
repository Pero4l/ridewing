'use strict';

/**
 * Jest environment bootstrap.
 *
 * Runs before the test framework is installed, so `require('../src/config/env')`
 * finds a valid configuration. These are throwaway test values — the real server
 * reads them from `.env`.
 */

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || 'test-only-secret-value-at-least-32-characters-long';
process.env.LOG_LEVEL = 'silent';
process.env.BCRYPT_ROUNDS = process.env.BCRYPT_ROUNDS || '10'; // keep tests quick
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || 'http://localhost:3000';
process.env.DB_NAME = process.env.DB_NAME || 'ridewing_test';
