'use strict';

/** Ride participation. One row per rider per ride, reused across rejoins. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('ride_participants', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      ride_session_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'ride_sessions', key: 'id' },
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
      status: { type: Sequelize.ENUM('joined', 'left'), allowNull: false, defaultValue: 'joined' },
      joined_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      left_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    await queryInterface.addIndex('ride_participants', ['ride_session_id', 'user_id'], {
      unique: true,
      name: 'ride_participants_ride_user_unique',
    });
    await queryInterface.addIndex('ride_participants', ['user_id'], {
      name: 'ride_participants_user_id_idx',
    });
    // Counting currently-joined riders before admitting another.
    await queryInterface.addIndex('ride_participants', ['ride_session_id', 'status'], {
      name: 'ride_participants_ride_status_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('ride_participants');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_ride_participants_status";');
  },
};
