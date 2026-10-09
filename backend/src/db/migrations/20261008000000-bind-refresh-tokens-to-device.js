'use strict';

/**
 * Binds a refresh token to the client device that requested it.
 *
 * Refresh-token theft detection used to compare only `user_agent`, and treated a
 * *missing* agent on either side as "same browser". Any non-browser client
 * (curl, a script, a server-side proxy) sends no User-Agent, so a stolen cookie
 * replayed from one of those was accepted as legitimate and minted a fresh,
 * valid access + refresh pair for the victim.
 *
 * `device_id` is an opaque client-generated id sent in `X-Device-Id`. It is not a
 * secret — it exists so rotation can be bound to a device, and the comparison
 * fails *closed* when the binding is absent.
 */
module.exports = {
  async up(queryInterface) {
    const table = await queryInterface.describeTable('refresh_tokens');
    if (!table.device_id) {
      await queryInterface.addColumn('refresh_tokens', 'device_id', {
        type: queryInterface.sequelize.Sequelize.STRING(64),
        allowNull: true,
      });
    }
    await queryInterface.sequelize.query(
      'CREATE INDEX IF NOT EXISTS "refresh_tokens_device_id" ON "refresh_tokens" ("device_id")',
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS "refresh_tokens_device_id"');
    const table = await queryInterface.describeTable('refresh_tokens');
    if (table.device_id) {
      await queryInterface.removeColumn('refresh_tokens', 'device_id');
    }
  },
};