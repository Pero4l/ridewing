'use strict';

/**
 * Group ride positions and live rider tracking.
 *
 * Adds:
 *   - ride_participants.position         one primary role per rider
 *   - ride_participants.last location   coordinates, accuracy, heading, progress,
 *                                        freshness timestamp, sharing flag
 *   - ride_sessions boundary thresholds  creator-configurable forward/rear metres
 *   - notification enum values           ride_position / ride_boundary
 *
 * Existing data is preserved. The creator's participant row in every existing
 * ride is promoted to LEAD_RIDER; everyone else keeps the safe default of
 * FORMATION_RIDER. No table is dropped, recreated or truncated.
 *
 * THIS FILE IS NOT EXECUTED BY THE APPLICATION. Run it manually with
 *   npm --prefix backend run db:migrate
 * after reviewing it.
 */

const POSITIONS = [
  'LEAD_RIDER',
  'ASSISTANT_ROAD_CAPTAIN',
  'ROAD_MARSHAL',
  'SWEEPER',
  'NAVIGATION_OFFICER',
  'SAFETY_OFFICER',
  'SUPPORT_RECOVERY_RIDER',
  'FORMATION_RIDER',
];

module.exports = {
  async up(queryInterface, Sequelize) {
    // PostgreSQL has no CREATE TYPE IF NOT EXISTS. The DO block makes the
    // migration safe to re-run without dropping anything.
    await queryInterface.sequelize.query(`
      DO $$
      BEGIN
        CREATE TYPE "enum_ride_participants_position" AS ENUM (${POSITIONS.map((value) => `'${value}'`).join(', ')});
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END
      $$;
    `);

    await queryInterface.addColumn('ride_participants', 'position', {
      type: '"enum_ride_participants_position"',
      allowNull: false,
      defaultValue: 'FORMATION_RIDER',
    });

    await queryInterface.addColumn('ride_participants', 'latitude', {
      type: Sequelize.DECIMAL(9, 6),
      allowNull: true,
    });
    await queryInterface.addColumn('ride_participants', 'longitude', {
      type: Sequelize.DECIMAL(9, 6),
      allowNull: true,
    });
    await queryInterface.addColumn('ride_participants', 'location_accuracy', {
      type: Sequelize.FLOAT,
      allowNull: true,
    });
    await queryInterface.addColumn('ride_participants', 'location_heading', {
      type: Sequelize.FLOAT,
      allowNull: true,
    });
    await queryInterface.addColumn('ride_participants', 'route_progress', {
      // 0..1 along the planned route when the client has route geometry.
      type: Sequelize.FLOAT,
      allowNull: true,
    });
    await queryInterface.addColumn('ride_participants', 'location_updated_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('ride_participants', 'location_sharing', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    // Reject impossible coordinates at the database boundary as well as in the
    // API validator. A bad app build cannot poison the stored location.
    await queryInterface.sequelize.query(`
      ALTER TABLE "ride_participants"
      ADD CONSTRAINT "ride_participants_latitude_range"
      CHECK ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90);
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE "ride_participants"
      ADD CONSTRAINT "ride_participants_longitude_range"
      CHECK ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180);
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE "ride_participants"
      ADD CONSTRAINT "ride_participants_accuracy_range"
      CHECK ("location_accuracy" IS NULL OR "location_accuracy" BETWEEN 0 AND 5000);
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE "ride_participants"
      ADD CONSTRAINT "ride_participants_route_progress_range"
      CHECK ("route_progress" IS NULL OR "route_progress" BETWEEN 0 AND 1);
    `);

    await queryInterface.addIndex('ride_participants', ['ride_session_id', 'position'], {
      name: 'ride_participants_ride_position_idx',
    });

    // Existing rides: the creator was always enrolled as the first participant.
    // Promote those rows so legacy rides still have a forward boundary.
    await queryInterface.sequelize.query(`
      UPDATE "ride_participants" AS rp
      SET "position" = 'LEAD_RIDER'
      FROM "ride_sessions" AS rs
      WHERE rp."ride_session_id" = rs."id"
        AND rp."user_id" = rs."creator_id"
        AND rp."status" = 'joined';
    `);

    await queryInterface.addColumn('ride_sessions', 'forward_boundary_m', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 500,
    });
    await queryInterface.addColumn('ride_sessions', 'rear_boundary_m', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 800,
    });
    await queryInterface.sequelize.query(`
      ALTER TABLE "ride_sessions"
      ADD CONSTRAINT "ride_sessions_forward_boundary_range"
      CHECK ("forward_boundary_m" BETWEEN 100 AND 5000);
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE "ride_sessions"
      ADD CONSTRAINT "ride_sessions_rear_boundary_range"
      CHECK ("rear_boundary_m" BETWEEN 100 AND 5000);
    `);

    // PostgreSQL cannot add an enum value inside some transactions; the existing
    // enum migrations follow the same no-transaction pattern.
    await queryInterface.sequelize.query(
      "ALTER TYPE \"enum_notifications_type\" ADD VALUE IF NOT EXISTS 'ride_position';",
    );
    await queryInterface.sequelize.query(
      "ALTER TYPE \"enum_notifications_type\" ADD VALUE IF NOT EXISTS 'ride_boundary';",
    );
  },

  async down(queryInterface) {
    // Notification enum values cannot be removed by PostgreSQL; they stay
    // harmless. The tracking columns, thresholds and position type are removed.
    await queryInterface.sequelize.query(
      'ALTER TABLE "ride_sessions" DROP CONSTRAINT IF EXISTS "ride_sessions_forward_boundary_range";',
    );
    await queryInterface.sequelize.query(
      'ALTER TABLE "ride_sessions" DROP CONSTRAINT IF EXISTS "ride_sessions_rear_boundary_range";',
    );
    await queryInterface.removeColumn('ride_sessions', 'forward_boundary_m');
    await queryInterface.removeColumn('ride_sessions', 'rear_boundary_m');

    await queryInterface.removeIndex('ride_participants', 'ride_participants_ride_position_idx');
    await queryInterface.sequelize.query(
      'ALTER TABLE "ride_participants" DROP CONSTRAINT IF EXISTS "ride_participants_latitude_range";',
    );
    await queryInterface.sequelize.query(
      'ALTER TABLE "ride_participants" DROP CONSTRAINT IF EXISTS "ride_participants_longitude_range";',
    );
    await queryInterface.sequelize.query(
      'ALTER TABLE "ride_participants" DROP CONSTRAINT IF EXISTS "ride_participants_accuracy_range";',
    );
    await queryInterface.sequelize.query(
      'ALTER TABLE "ride_participants" DROP CONSTRAINT IF EXISTS "ride_participants_route_progress_range";',
    );
    await queryInterface.removeColumn('ride_participants', 'location_sharing');
    await queryInterface.removeColumn('ride_participants', 'location_updated_at');
    await queryInterface.removeColumn('ride_participants', 'route_progress');
    await queryInterface.removeColumn('ride_participants', 'location_heading');
    await queryInterface.removeColumn('ride_participants', 'location_accuracy');
    await queryInterface.removeColumn('ride_participants', 'longitude');
    await queryInterface.removeColumn('ride_participants', 'latitude');
    await queryInterface.removeColumn('ride_participants', 'position');
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_ride_participants_position";',
    );
  },
};
