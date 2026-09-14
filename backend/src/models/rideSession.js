'use strict';

/**
 * A live group ride with voice.
 *
 * `voiceMode` is the session default that clients apply when joining;
 * per-rider mute state is ephemeral and deliberately kept in memory, not here.
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

  RideSession.prototype.toJSONSafe = function toJSONSafe() {
    return {
      id: this.id,
      name: this.name,
      status: this.status,
      voiceMode: this.voiceMode,
      inviteCode: this.inviteCode,
      maxParticipants: this.maxParticipants,
      creatorId: this.creatorId,
      creator: this.creator ? this.creator.toPublicJSON() : undefined,
      createdAt: this.createdAt,
      endedAt: this.endedAt,
      participants: this.participants
        ? this.participants.map((participant) => participant.toJSONSafe())
        : undefined,
    };
  };

  return RideSession;
};
