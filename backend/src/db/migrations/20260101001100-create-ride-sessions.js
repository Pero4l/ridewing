'use strict';

/** Ride sessions and their participants. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('ride_sessions', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      creator_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      name: { type: Sequelize.STRING(80), allowNull: false },
      status: {
        type: Sequelize.ENUM('active', 'ended'),
        allowNull: false,
        defaultValue: 'active',
      },
      voice_mode: { type: Sequelize.ENUM('ptt', 'open'), allowNull: false, defaultValue: 'ptt' },
      invite_code: { type: Sequelize.STRING(12), allowNull: false, unique: true },
      max_participants: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 8 },
      ended_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    await queryInterface.addIndex('ride_sessions', ['creator_id'], {
      name: 'ride_sessions_creator_id_idx',
    });
    // "Active rides" listing.
    await queryInterface.addIndex('ride_sessions', ['status', 'created_at'], {
      name: 'ride_sessions_status_created_at_idx',
    });

    // Mesh WebRTC does not scale without bound — keep the cap sane.
    await queryInterface.sequelize.query(`
      ALTER TABLE "ride_sessions"
      ADD CONSTRAINT "ride_sessions_max_participants_range"
      CHECK ("max_participants" BETWEEN 2 AND 50);
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('ride_sessions');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_ride_sessions_status";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_ride_sessions_voice_mode";');
  },
};
