'use strict';

/**
 * Admin activity log.
 *
 * Moderation actions are destructive and occasionally disputed: a rider says
 * they did not write the post that got them suspended, or a staff member says
 * they never demoted anyone. `users.suspended_by` records who suspended *that*
 * account, but says nothing about the rest of the admin surface, and a role
 * change leaves no trace at all once applied.
 *
 * This table is the answer: append-only, written in the same transaction as the
 * action it describes. If the action rolls back, the log entry does too — so
 * the log cannot claim something happened that did not.
 *
 * Deliberately not updated or deleted by the application. There is no route
 * that writes to this table other than adminService, and no route that edits
 * its rows.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('admin_activity_logs', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      // The staff member who acted. ON DELETE SET NULL rather than CASCADE: if a
      // staff account is ever removed we keep the record of what it did and lose
      // only the name attached to it.
      adminId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      adminUsername: {
        type: Sequelize.STRING(30),
        allowNull: false,
      },
      action: {
        type: Sequelize.STRING(60),
        allowNull: false,
      },
      targetId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      targetUsername: {
        type: Sequelize.STRING(30),
        allowNull: true,
      },
      // Free-form context (the reason given, the previous role, the previous
      // status). Bounded by the admin validator rather than by this column, so
      // the shape stays consistent.
      metadata: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    // The console reads this newest-first, filtered by action or by actor.
    await queryInterface.addIndex('admin_activity_logs', ['createdAt']);
    await queryInterface.addIndex('admin_activity_logs', ['action', 'createdAt']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('admin_activity_logs');
  },
};
