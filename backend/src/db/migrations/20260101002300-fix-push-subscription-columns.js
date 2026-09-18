'use strict';

/**
 * Normalise push_subscriptions column names.
 *
 * The original create-table migration (02000) used camelCase column names
 * (`userId`) while the Sequelize model is configured with `underscored: true`,
 * so the runtime queries snake_case (`user_id`).  On a DB where 02000 already
 * ran the table has the wrong names; on a fresh DB the follow-up columns are
 * harmless because the renames below are conditional (only fire when the camel
 * case column actually exists).
 */

const RENAMES = [
  ['userId', 'user_id'],
  ['deviceId', 'device_id'],
  ['userAgent', 'user_agent'],
  ['lastSeenDeviceAt', 'last_seen_device_at'],
  ['createdAt', 'created_at'],
  ['updatedAt', 'updated_at'],
];

async function columnExists(queryInterface, table, col) {
  const rows = await queryInterface.sequelize.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = :table AND column_name = :col",
    { replacements: { table, col }, type: queryInterface.sequelize.QueryTypes.SELECT },
  );
  return rows.length > 0;
}

module.exports = {
  async up(queryInterface) {
    for (const [from, to] of RENAMES) {
      const hasOld = await columnExists(queryInterface, 'push_subscriptions', from);
      const hasNew = await columnExists(queryInterface, 'push_subscriptions', to);
      if (hasOld && !hasNew) {
        await queryInterface.renameColumn('push_subscriptions', from, to);
      }
    }
  },

  async down() {
    // The original camelCase column names are wrong for the model; down is a
    // no-op so the fix can be applied repeatedly without fear.
  },
};
