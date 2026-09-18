'use strict';

/** Nested comment replies and the matching notification type. */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('post_comments');
    if (!table.parent_id) {
      await queryInterface.addColumn('post_comments', 'parent_id', {
        type: Sequelize.UUID,
        allowNull: true,
        defaultValue: null,
      });
      await queryInterface.addIndex('post_comments', ['post_id', 'parent_id', 'created_at']);
    }
    await queryInterface.addConstraint('post_comments', {
      fields: ['parent_id'],
      type: 'foreign key',
      name: 'post_comments_parent_id_fkey',
      references: { table: 'post_comments', field: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });
    await queryInterface.sequelize.query(
      "ALTER TYPE \"enum_notifications_type\" ADD VALUE IF NOT EXISTS 'comment_reply';",
    );
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('post_comments', ['post_id', 'parent_id', 'created_at']);
    await queryInterface.removeConstraint('post_comments', 'post_comments_parent_id_fkey');
    await queryInterface.removeColumn('post_comments', 'parent_id');
    // PostgreSQL cannot remove enum values; the migration is intentionally not
    // reversible. New values never break old rows.
  },
};