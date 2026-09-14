'use strict';

/**
 * Enables `pgcrypto` so `gen_random_uuid()` is available as a column default.
 *
 * Postgres 13+ ships that function in core, but creating the extension keeps the
 * migrations working on older servers too. Requires a role with CREATE privilege
 * on the database; if your managed Postgres forbids it, the function already
 * exists on 13+ and this is a no-op.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');
  },

  async down(queryInterface) {
    // Left installed on purpose: other objects may depend on it.
    await queryInterface.sequelize.query('SELECT 1;');
  },
};
