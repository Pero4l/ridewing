'use strict';

/**
 * Sequelize CLI configuration.
 *
 * Deliberately independent of `env.js`: running a migration should not require the
 * auth secrets that the API server needs, only database credentials.
 */

const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const truthy = (value) => value === 'true' || value === '1';

const common = {
  dialect: 'postgres',
  logging: truthy(process.env.DB_LOGGING) ? console.log : false, // eslint-disable-line no-console
  define: {
    underscored: true,
    freezeTableName: false,
  },
  pool: {
    max: Number(process.env.DB_POOL_MAX || 10),
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
};

const ssl = truthy(process.env.DB_SSL)
  ? { ssl: { require: true, rejectUnauthorized: false } }
  : {};

function build(defaultDatabase) {
  if (process.env.DATABASE_URL) {
    return {
      ...common,
      url: process.env.DATABASE_URL,
      use_env_variable: 'DATABASE_URL',
      dialectOptions: { ...ssl },
    };
  }

  return {
    ...common,
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || defaultDatabase,
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    dialectOptions: { ...ssl },
  };
}

module.exports = {
  development: build('ridewing_development'),
  test: build('ridewing_test'),
  production: build('ridewing_production'),
};
