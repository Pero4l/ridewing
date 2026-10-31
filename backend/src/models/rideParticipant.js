'use strict';

const { RIDE_POSITIONS, DEFAULT_RIDE_POSITION } = require('../utils/ridePositions');

/**
 * A rider's membership in a ride session.
 *
 * One row per rider per ride, reused across rejoins: a rider who drops out of
 * signal and comes back gets `leftAt` cleared rather than a second row.
 *
 * `position` is the rider's one primary group role. `latitude`/`longitude` are
 * only written by the authenticated rider themselves while the ride is active
 * and they have location sharing switched on; they are cleared when the rider
 * leaves or the ride ends. Freshness is judged from `locationUpdatedAt`, never
 * from the mere presence of a coordinate.
 */
module.exports = (sequelize, DataTypes) => {
  const RideParticipant = sequelize.define(
    'RideParticipant',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      rideSessionId: { type: DataTypes.UUID, allowNull: false },
      userId: { type: DataTypes.UUID, allowNull: false },
      status: {
        type: DataTypes.ENUM('joined', 'left'),
        allowNull: false,
        defaultValue: 'joined',
      },
      position: {
        type: DataTypes.ENUM(...RIDE_POSITIONS),
        allowNull: false,
        defaultValue: DEFAULT_RIDE_POSITION,
      },
      joinedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      leftAt: { type: DataTypes.DATE, allowNull: true },
      // Distress signals. NULL = off, a timestamp = on (and when it was raised).
      helpRequestedAt: { type: DataTypes.DATE, allowNull: true },
      stoppedAt: { type: DataTypes.DATE, allowNull: true },
      // Last accepted live location. Nullable until the rider opts in.
      latitude: {
        type: DataTypes.DECIMAL(9, 6),
        allowNull: true,
        validate: { min: -90, max: 90 },
      },
      longitude: {
        type: DataTypes.DECIMAL(9, 6),
        allowNull: true,
        validate: { min: -180, max: 180 },
      },
      locationAccuracy: {
        type: DataTypes.FLOAT,
        allowNull: true,
        validate: { min: 0, max: 5000 },
      },
      locationHeading: {
        type: DataTypes.FLOAT,
        allowNull: true,
        validate: { min: 0, max: 360 },
      },
      routeProgress: {
        type: DataTypes.FLOAT,
        allowNull: true,
        validate: { min: 0, max: 1 },
      },
      locationUpdatedAt: { type: DataTypes.DATE, allowNull: true },
      locationSharing: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    {
      tableName: 'ride_participants',
      indexes: [
        {
          unique: true,
          fields: ['ride_session_id', 'user_id'],
          name: 'ride_participants_ride_user_unique',
        },
        { fields: ['user_id'] },
        { fields: ['ride_session_id', 'status'] },
        { fields: ['ride_session_id', 'position'], name: 'ride_participants_ride_position_idx' },
      ],
    },
  );

  RideParticipant.associate = (db) => {
    RideParticipant.belongsTo(db.RideSession, { foreignKey: 'rideSessionId', as: 'rideSession' });
    RideParticipant.belongsTo(db.User, { foreignKey: 'userId', as: 'user' });
  };

  RideParticipant.prototype.toJSONSafe = function toJSONSafe({ includeLocation = true } = {}) {
    const hasLocation =
      includeLocation &&
      this.latitude !== null &&
      this.latitude !== undefined &&
      this.longitude !== null &&
      this.longitude !== undefined;

    return {
      userId: this.userId,
      status: this.status,
      position: this.position,
      joinedAt: this.joinedAt,
      leftAt: this.leftAt,
      helpRequestedAt: this.helpRequestedAt ?? null,
      stoppedAt: this.stoppedAt ?? null,
      locationSharing: includeLocation ? Boolean(this.locationSharing) : false,
      location: hasLocation
        ? {
            latitude: Number(this.latitude),
            longitude: Number(this.longitude),
            accuracy: this.locationAccuracy == null ? null : Number(this.locationAccuracy),
            heading: this.locationHeading == null ? null : Number(this.locationHeading),
            routeProgress: this.routeProgress == null ? null : Number(this.routeProgress),
            updatedAt: this.locationUpdatedAt,
          }
        : null,
      user: this.user ? this.user.toPublicJSON() : undefined,
    };
  };

  return RideParticipant;
};
