'use strict';

/** Follow edges between riders. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('follows', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      follower_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      following_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    await queryInterface.addIndex('follows', ['follower_id', 'following_id'], {
      unique: true,
      name: 'follows_follower_following_unique',
    });
    // Reverse lookup: "who follows me".
    await queryInterface.addIndex('follows', ['following_id'], { name: 'follows_following_id_idx' });

    // Self-follow is meaningless; block it in the database as well as the model.
    await queryInterface.sequelize.query(`
      ALTER TABLE "follows"
      ADD CONSTRAINT "follows_no_self_follow"
      CHECK ("follower_id" <> "following_id");
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('follows');
  },
};
