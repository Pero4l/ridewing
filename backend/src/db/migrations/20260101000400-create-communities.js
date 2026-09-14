'use strict';

/** Communities and their membership/moderation tables. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('communities', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      name: { type: Sequelize.STRING(80), allowNull: false },
      slug: { type: Sequelize.STRING(80), allowNull: false, unique: true },
      bio: { type: Sequelize.TEXT, allowNull: true },
      image: { type: Sequelize.STRING(500), allowNull: true },
      owner_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        // Ownership must be transferred before an account can be removed.
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
      join_policy: {
        type: Sequelize.ENUM('open', 'request'),
        allowNull: false,
        defaultValue: 'request',
      },
      member_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      follower_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    await queryInterface.addIndex('communities', ['owner_id'], {
      name: 'communities_owner_id_idx',
    });
    // Counters must never go negative even if a code path double-decrements.
    await queryInterface.sequelize.query(`
      ALTER TABLE "communities"
      ADD CONSTRAINT "communities_counts_non_negative"
      CHECK ("member_count" >= 0 AND "follower_count" >= 0);
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('communities');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_communities_join_policy";');
  },
};
