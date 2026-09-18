'use strict';

/** Extends the notification type enum with support ticket events. */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      "ALTER TYPE \"enum_notifications_type\" ADD VALUE IF NOT EXISTS 'support_ticket';",
    );
  },

  async down(queryInterface) {
    // PostgreSQL cannot remove enum values; the migration is intentionally not
    // reversible. New values never break old rows.
  },
};