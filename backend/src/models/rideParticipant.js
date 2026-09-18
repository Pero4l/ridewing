'use strict';

/**
 * A rider's membership in a ride session.
 *
 * One row per rider per ride, reused across rejoins: a rider who drops out of
 * signal and comes back gets `leftAt` cleared rather than a second row.
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
      joinedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      leftAt: { type: DataTypes.DATE, allowNull: true },
      // Distress signals. NULL = off, a timestamp = on (and when it was raised).
      helpRequestedAt: { type: DataTypes.DATE, allowNull: true },
      stoppedAt: { type: DataTypes.DATE, allowNull: true },
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
      ],
    },
  );

  RideParticipant.associate = (db) => {
    RideParticipant.belongsTo(db.RideSession, { foreignKey: 'rideSessionId', as: 'rideSession' });
    RideParticipant.belongsTo(db.User, { foreignKey: 'userId', as: 'user' });
  };

  RideParticipant.prototype.toJSONSafe = function toJSONSafe() {
    return {
      userId: this.userId,
      status: this.status,
      joinedAt: this.joinedAt,
      leftAt: this.leftAt,
      helpRequestedAt: this.helpRequestedAt ?? null,
      stoppedAt: this.stoppedAt ?? null,
      user: this.user ? this.user.toPublicJSON() : undefined,
    };
  };

  return RideParticipant;
};
