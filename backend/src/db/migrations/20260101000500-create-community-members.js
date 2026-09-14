'use strict';

/** Community membership with roles — the source of truth for authorization. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('community_members', {
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
      role: {
        type: Sequelize.ENUM('owner', 'admin', 'moderator', 'member'),
        allowNull: false,
        defaultValue: 'member',
      },
      status: {
        type: Sequelize.ENUM('active', 'left', 'banned'),
        allowNull: false,
        defaultValue: 'active',
      },
      joined_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    await queryInterface.addIndex('community_members', ['community_id', 'user_id'], {
      unique: true,
      name: 'community_members_community_user_unique',
    });
    await queryInterface.addIndex('community_members', ['user_id'], {
      name: 'community_members_user_id_idx',
    });
    // Member roster reads filter on status.
    await queryInterface.addIndex('community_members', ['community_id', 'status'], {
      name: 'community_members_community_status_idx',
    });
    // Exactly one owner row per community.
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX "community_members_single_owner_unique"
      ON "community_members" ("community_id")
      WHERE "role" = 'owner';
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('community_members');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_community_members_role";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_community_members_status";');
  },
};
