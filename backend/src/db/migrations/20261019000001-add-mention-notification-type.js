'use strict';

/** Add mention notification type. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_notifications_type" ADD VALUE 'mention';
    `);
  },

  async down(queryInterface, Sequelize) {
    // Can't easily remove enum values, so we leave it
  },
};