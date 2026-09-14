'use strict';

/** Conversation participation — checked before any room join or history read. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('conversation_members', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      conversation_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'conversations', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      last_read_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    await queryInterface.addIndex('conversation_members', ['conversation_id', 'user_id'], {
      unique: true,
      name: 'conversation_members_conversation_user_unique',
    });
    // "List my conversations" reads this side.
    await queryInterface.addIndex('conversation_members', ['user_id'], {
      name: 'conversation_members_user_id_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('conversation_members');
  },
};
