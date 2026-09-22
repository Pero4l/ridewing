'use strict';

/**
 * Ride inactivity tracking.
 *
 * `ride_sessions.last_activity_at` is the last moment someone did something on
 * the ride (create, join, leave, signals, live voice). A background sweep ends
 * any active ride that has sat quiet for the idle threshold, so a forgotten
 * session cannot stay open forever.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('ride_sessions', 'last_activity_at', {
      type: Sequelize.DATE,
      allowNull: false,
      // Existing active rides inherit their creation time so they are not
      // ended the moment the sweep first runs.
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    });

    // The sweep query: status = active ordered/limited by last_activity_at.
    await queryInterface.addIndex('ride_sessions', ['status', 'last_activity_at'], {
      name: 'ride_sessions_status_last_activity_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('ride_sessions', 'ride_sessions_status_last_activity_idx');
    await queryInterface.removeColumn('ride_sessions', 'last_activity_at');
  },
};