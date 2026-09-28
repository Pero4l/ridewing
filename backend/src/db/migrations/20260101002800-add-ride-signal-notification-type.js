'use strict';

/**
 * Ride distress signals as a notification type.
 *
 * "I need help" and "I've stopped" used to reach other riders only through the
 * socket broadcast, so a rider with the app closed — which is exactly the person
 * who most needs to know — never heard about it. Recording it as a notification
 * makes it durable, so the signal shows up in the notification list and rides
 * out on Web Push.
 */
module.exports = {
  async up(queryInterface) {
    // ADD VALUE cannot run inside a transaction on older PostgreSQL, which is why
    // the other enum migrations already avoid `queryInterface.transaction()`.
    await queryInterface.sequelize.query("ALTER TYPE \"enum_notifications_type\" ADD VALUE IF NOT EXISTS 'ride_signal';");
  },

  async down() {
    // PostgreSQL cannot remove an enum value, so this is intentionally a no-op —
    // the same choice made by 01700. Rolling the migration back is recorded;
    // the value simply stays available.
  },
};
