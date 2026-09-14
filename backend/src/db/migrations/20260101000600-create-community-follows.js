'use strict';

/** Lightweight community following (no chat access). */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('community_follows', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      community_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'communities', key: 'id' },
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
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    await queryInterface.addIndex('community_follows', ['community_id', 'user_id'], {
      unique: true,
      name: 'community_follows_community_user_unique',
    });
    await queryInterface.addIndex('community_follows', ['user_id'], {
      name: 'community_follows_user_id_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('community_follows');
  },
};
