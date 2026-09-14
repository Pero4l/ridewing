'use strict';

/** In-app notifications. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('notifications', {
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
      type: {
        type: Sequelize.ENUM(
          'follow',
          'community_join_request',
          'community_join_approved',
          'community_join_rejected',
          'community_role_changed',
          'ride_invite',
          'message',
        ),
        allowNull: false,
      },
      actor_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      entity_type: { type: Sequelize.STRING(40), allowNull: true },
      entity_id: { type: Sequelize.UUID, allowNull: true },
      data: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      read_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    // Notification feed, newest first.
    await queryInterface.addIndex('notifications', ['user_id', 'created_at'], {
      name: 'notifications_user_created_at_idx',
    });
    // Unread badge count.
    await queryInterface.addIndex('notifications', ['user_id', 'read_at'], {
      name: 'notifications_user_read_at_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('notifications');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_notifications_type";');
  },
};
