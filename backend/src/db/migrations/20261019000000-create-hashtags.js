'use strict';

/** Hashtags for posts. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('hashtags', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      tag: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true,
      },
      post_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('now'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('now'),
      },
    });

    await queryInterface.addIndex('hashtags', ['tag'], {
      name: 'hashtags_tag_idx',
      unique: true,
    });

    // Junction table for posts and hashtags (many-to-many)
    await queryInterface.createTable('post_hashtags', {
      post_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'posts', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      hashtag_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'hashtags', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('now'),
      },
    });

    await queryInterface.addConstraint('post_hashtags', {
      fields: ['post_id', 'hashtag_id'],
      type: 'primary key',
      name: 'post_hashtags_pkey',
    });

    await queryInterface.addIndex('post_hashtags', ['hashtag_id'], {
      name: 'post_hashtags_hashtag_id_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('post_hashtags');
    await queryInterface.dropTable('hashtags');
  },
};