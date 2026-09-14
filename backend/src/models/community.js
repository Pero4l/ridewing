'use strict';

/** Community roles, ordered from most to least privileged. */
const ROLES = ['owner', 'admin', 'moderator', 'member'];
const RANK = { owner: 3, admin: 2, moderator: 1, member: 0 };

module.exports = (sequelize, DataTypes) => {
  const Community = sequelize.define(
    'Community',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name: {
        type: DataTypes.STRING(80),
        allowNull: false,
        validate: { len: { args: [3, 80], msg: 'Community name must be 3-80 characters' } },
      },
      slug: { type: DataTypes.STRING(80), allowNull: false, unique: true },
      bio: { type: DataTypes.TEXT, allowNull: true },
      image: { type: DataTypes.STRING(500), allowNull: true },
      ownerId: { type: DataTypes.UUID, allowNull: false },
      // 'request' sends newcomers through CommunityJoinRequest; 'open' admits
      // them immediately. Both paths still create a CommunityMember row.
      joinPolicy: {
        type: DataTypes.ENUM('open', 'request'),
        allowNull: false,
        defaultValue: 'request',
      },
      // Denormalized counters, maintained inside the same transaction as the
      // membership change so they cannot drift.
      memberCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      followerCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    },
    {
      tableName: 'communities',
      indexes: [{ unique: true, fields: ['slug'] }, { fields: ['owner_id'] }],
    },
  );

  Community.ROLES = ROLES;
  Community.RANK = RANK;

  Community.associate = (db) => {
    Community.belongsTo(db.User, { foreignKey: 'ownerId', as: 'owner' });
    Community.hasMany(db.CommunityMember, { foreignKey: 'communityId', as: 'members' });
    Community.hasMany(db.CommunityFollow, { foreignKey: 'communityId', as: 'followers' });
    Community.hasMany(db.CommunityJoinRequest, { foreignKey: 'communityId', as: 'joinRequests' });
    Community.hasOne(db.Conversation, { foreignKey: 'communityId', as: 'conversation' });
  };

  Community.prototype.toJSONFor = function toJSONFor(viewer = {}) {
    return {
      id: this.id,
      name: this.name,
      slug: this.slug,
      bio: this.bio,
      image: this.image,
      ownerId: this.ownerId,
      joinPolicy: this.joinPolicy,
      memberCount: this.memberCount,
      followerCount: this.followerCount,
      createdAt: this.createdAt,
      owner: this.owner ? this.owner.toPublicJSON() : undefined,
      // Viewer-specific flags are supplied by the service layer.
      viewerRole: viewer.role ?? null,
      viewerStatus: viewer.status ?? null,
      viewerIsFollowing: viewer.isFollowing ?? false,
      viewerJoinRequestStatus: viewer.joinRequestStatus ?? null,
    };
  };

  return Community;
};
