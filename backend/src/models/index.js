'use strict';

/**
 * Model registry.
 *
 * Loads every model in this directory, wires associations, and exports a single
 * shared Sequelize instance. Nothing else in the app constructs a connection.
 */

const fs = require('fs');
const path = require('path');
const { Sequelize } = require('sequelize');

const env = require('../config/env');
const logger = require('../config/logger');

const basename = path.basename(__filename);

const options = {
  dialect: 'postgres',
  logging: env.db.logging ? (msg) => logger.debug({ sql: msg }, 'sequelize') : false,
  define: {
    underscored: true, // camelCase attributes, snake_case columns
  },
  pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
  dialectOptions: env.db.ssl ? { ssl: { require: true, rejectUnauthorized: false } } : {},
};

const sequelize = env.db.url
  ? new Sequelize(env.db.url, options)
  : new Sequelize(env.db.name, env.db.user, env.db.password, {
      ...options,
      host: env.db.host,
      port: env.db.port,
    });

const db = { sequelize, Sequelize };

fs.readdirSync(__dirname)
  .filter((file) => file !== basename && file.endsWith('.js') && !file.startsWith('.'))
  .sort()
  .forEach((file) => {
    const define = require(path.join(__dirname, file));
    const model = define(sequelize, Sequelize.DataTypes);
    db[model.name] = model;
  });

Object.values(db).forEach((model) => {
  if (model && typeof model.associate === 'function') model.associate(db);
});

module.exports = db;
