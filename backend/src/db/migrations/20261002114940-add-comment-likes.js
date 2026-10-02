'use strict';

/** Comment likes and like count on comments. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('comment_likes', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      comment_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'post_comments', key: 'id' },
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
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });
    await queryInterface.addIndex('comment_likes', ['comment_id', 'user_id'], {
      name: 'comment_likes_comment_user_unique',
      unique: true,
    });
    await queryInterface.addIndex('comment_likes', ['user_id', 'created_at'], {
      name: 'comment_likes_user_created_at_idx',
    });

    await queryInterface.addColumn('post_comments', 'like_count', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('post_comments', 'like_count');
    await queryInterface.dropTable('comment_likes');
  },
};