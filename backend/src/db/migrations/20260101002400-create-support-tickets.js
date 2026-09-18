'use strict';

/** Support tickets: created by riders, resolved from the admin queue. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('support_tickets', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      subject: { type: Sequelize.STRING(120), allowNull: false },
      body: { type: Sequelize.TEXT, allowNull: false },
      status: {
        type: Sequelize.ENUM('open', 'resolved'),
        allowNull: false,
        defaultValue: 'open',
      },
      resolution_note: { type: Sequelize.TEXT, allowNull: true },
      resolved_at: { type: Sequelize.DATE, allowNull: true },
      resolved_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    // "My tickets" listing, newest first.
    await queryInterface.addIndex('support_tickets', ['user_id', 'created_at'], {
      name: 'support_tickets_user_id_created_at_idx',
    });
    // The admin queue and history.
    await queryInterface.addIndex('support_tickets', ['status', 'created_at'], {
      name: 'support_tickets_status_created_at_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('support_tickets');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_support_tickets_status";');
  },
};