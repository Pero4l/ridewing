'use strict';

/**
 * Account moderation.
 *
 * `users.role` says what an account may do; these columns say whether it is
 * currently allowed to do anything at all. Without a status column, "moderation"
 * could only mean deleting rows — and a deleted account's posts, rides and
 * messages would vanish with them, which is both destructive and impossible to
 * reverse from the UI.
 *
 * Suspension is the soft version: the row stays, the rider cannot authenticate,
 * and lifting it restores the account with its history intact. We revoke the
 * account's refresh tokens on suspension, because otherwise a short-lived access
 * token would keep working until it expired on its own.
 *
 * `suspended_by` records which admin did it rather than only a timestamp, so a
 * disputed suspension can be traced to a person and not just to a moment.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'status', {
      type: Sequelize.ENUM('active', 'suspended'),
      allowNull: false,
      defaultValue: 'active',
    });
    await queryInterface.addIndex('users', ['status']);

    await queryInterface.addColumn('users', 'suspended_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.addColumn('users', 'suspension_reason', {
      type: Sequelize.STRING(500),
      allowNull: true,
    });

    // A real FK to users, not a loose UUID: a suspension is only meaningful if
    // the admin who set it is still identifiable.
    await queryInterface.addColumn('users', 'suspended_by', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'suspended_by');
    await queryInterface.removeColumn('users', 'suspension_reason');
    await queryInterface.removeColumn('users', 'suspended_at');
    await queryInterface.removeIndex('users', ['status']);
    await queryInterface.removeColumn('users', 'status');
    // The enum type is intentionally left behind: Postgres will not drop it
    // while a dependent column exists, and leaving an orphan type is harmless
    // next to a failed rollback of a production moderation action.
  },
};
