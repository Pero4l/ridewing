'use strict';

/**
 * Ride distress signals.
 *
 * `ride_participants.help_requested_at` and `ride_participants.stopped_at` let
 * a rider flag "I need help" or "I've pulled over" without leaving the voice
 * channel. They are plain timestamps: `NULL` means the signal is off, a value
 * means it is on. The value doubles as the audit record of when it was raised.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('ride_participants', 'help_requested_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('ride_participants', 'stopped_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('ride_participants', 'stopped_at');
    await queryInterface.removeColumn('ride_participants', 'help_requested_at');
  },
};