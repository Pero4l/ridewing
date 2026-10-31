'use strict';

/**
 * A live group ride with voice.
 *
 * `voiceMode` is the session default that clients apply when joining;
 * per-rider mute state is ephemeral and deliberately kept in memory, not here.
 *
 * The forward/rear boundary thresholds are per-ride so a tight city group and a
 * spread-out motorway group can both use the same monitoring code without
 * hard-coded magic numbers.
 */
module.exports = (sequelize, DataTypes) => {
  const RideSession = sequelize.define(
    'RideSession',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      creatorId: { type: DataTypes.UUID, allowNull: false },
      name: {
        type: DataTypes.STRING(80),
        allowNull: false,
        validate: { len: { args: [3, 80], msg: 'Ride name must be 3-80 characters' } },
      },
      status: {
        type: DataTypes.ENUM('active', 'ended'),
        allowNull: false,
        defaultValue: 'active',
      },
      voiceMode: {
        type: DataTypes.ENUM('ptt', 'open'),
        allowNull: false,
        defaultValue: 'ptt',
      },
      // Short code so riders can join without passing UUIDs around.
      inviteCode: { type: DataTypes.STRING(12), allowNull: false, unique: true },
      // V1 uses a mesh topology, so participant count is capped deliberately.
      maxParticipants: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 8 },
      endedAt: { type: DataTypes.DATE, allowNull: true },
      // Last moment of rider activity; the idle sweeper ends rides that have
      // been quiet for the threshold. Every ride action pokes this forward.
      lastActivityAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      // Metres beyond the Lead Rider / behind the Sweeper before a boundary is
      // considered violated. Kept configurable rather than repeated in code.
      forwardBoundaryM: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 500 },
      rearBoundaryM: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 800 },
    },
    {
      tableName: 'ride_sessions',
      indexes: [
        { unique: true, fields: ['invite_code'] },
        { fields: ['creator_id'] },
        { fields: ['status'] },
      ],
    },
  );

  RideSession.associate = (db) => {
    RideSession.belongsTo(db.User, { foreignKey: 'creatorId', as: 'creator' });
    RideSession.hasMany(db.RideParticipant, { foreignKey: 'rideSessionId', as: 'participants' });
  };

  RideSession.prototype.toJSONSafe = function toJSONSafe({ includeLocations = true } = {}) {
    return {
      id: this.id,
      name: this.name,
      status: this.status,
      voiceMode: this.voiceMode,
      inviteCode: this.inviteCode,
      maxParticipants: this.maxParticipants,
      creatorId: this.creatorId,
      forwardBoundaryM: this.forwardBoundaryM,
      rearBoundaryM: this.rearBoundaryM,
      creator: this.creator ? this.creator.toPublicJSON() : undefined,
      createdAt: this.createdAt,
      endedAt: this.endedAt,
      participants: this.participants
        ? this.participants.map((participant) => participant.toJSONSafe({ includeLocation: includeLocations }))
        : undefined,
    };
  };

  return RideSession;
};
