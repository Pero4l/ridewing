'use strict';

/** Join requests for request-gated communities. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('community_join_requests', {
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
      message: { type: Sequelize.STRING(300), allowNull: true },
      status: {
        type: Sequelize.ENUM('pending', 'approved', 'rejected', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
      },
      reviewed_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        // Keep the decision record if the reviewing moderator's account goes away.
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      reviewed_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    // Moderation queue read path.
    await queryInterface.addIndex('community_join_requests', ['community_id', 'status'], {
      name: 'community_join_requests_community_status_idx',
    });
    await queryInterface.addIndex('community_join_requests', ['user_id'], {
      name: 'community_join_requests_user_id_idx',
    });

    // Only one *pending* request per rider per community; decided requests are
    // kept as history, so a plain unique index would be wrong here.
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX "community_join_requests_one_pending_unique"
      ON "community_join_requests" ("community_id", "user_id")
      WHERE "status" = 'pending';
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('community_join_requests');
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_community_join_requests_status";',
    );
  },
};
