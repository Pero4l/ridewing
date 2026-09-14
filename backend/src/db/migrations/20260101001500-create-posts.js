'use strict';

/** Short-form posts. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('posts', {
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
      // RideWing posts are short-form: text with optional media. `media` mirrors
      // the Cloudinary response so clients can render without a second fetch.
      content: { type: Sequelize.TEXT, allowNull: false, defaultValue: '' },
      media: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      like_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      comment_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      share_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      edited_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    // Home feed window, newest first.
    await queryInterface.addIndex('posts', ['user_id', 'created_at'], {
      name: 'posts_user_created_at_idx',
    });
    await queryInterface.addIndex('posts', ['created_at'], {
      name: 'posts_created_at_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('posts');
  },
};