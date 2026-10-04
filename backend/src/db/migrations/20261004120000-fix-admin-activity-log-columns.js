'use strict';

/**
 * Repairs `admin_activity_logs`, which was created with camelCase columns.
 *
 * The model runs with `underscored: true`, so it reads `admin_id`, `target_id`
 * and `created_at`. The creating migration passed camelCase keys to
 * `queryInterface.createTable`, which takes them literally and does *not* apply
 * the model's `underscored` option — so the table got `"adminId"`, `"targetId"`
 * and `"createdAt"` instead, and every read and write against it failed with
 * `column "target_id" does not exist`.
 *
 * That is not only a broken audit read: `adminService` writes the log row in the
 * same transaction as the moderation action, so the insert failure rolled back
 * the suspend/role change with it. The whole admin surface was unusable, and
 * every test in the admin suite failed in its `afterEach` cleanup.
 *
 * The creating migration has been corrected, so this one has to cope with both
 * cases: a database created before the fix has camelCase columns, one created
 * after already has snake_case. Each rename is therefore applied only if the
 * camelCase column is actually present.
 *
 * Postgres rewrites index definitions when a column is renamed, so the two
 * indexes created on the old names keep working and keep their names.
 */
const { QueryTypes } = require('sequelize');

const RENAMES = [
  ['adminId', 'admin_id'],
  ['adminUsername', 'admin_username'],
  ['targetId', 'target_id'],
  ['targetUsername', 'target_username'],
  ['createdAt', 'created_at'],
];

const QUERY = `SELECT column_name FROM information_schema.columns WHERE table_name = 'admin_activity_logs'`;

/** The columns the table actually has, so each rename can be applied only if needed. */
async function presentColumns(queryInterface) {
  const rows = await queryInterface.sequelize.query(QUERY, { type: QueryTypes.SELECT });
  return new Set(rows.map((row) => row.column_name));
}

module.exports = {
  async up(queryInterface) {
    const present = await presentColumns(queryInterface);
    for (const [from, to] of RENAMES) {
      if (!present.has(from)) continue;
      await queryInterface.renameColumn('admin_activity_logs', from, to);
    }
  },

  async down(queryInterface) {
    const present = await presentColumns(queryInterface);
    for (const [from, to] of RENAMES) {
      if (!present.has(to)) continue;
      await queryInterface.renameColumn('admin_activity_logs', to, from);
    }
  },
};
