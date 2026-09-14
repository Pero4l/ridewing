'use strict';

/**
 * A request to join a request-gated community.
 *
 * A partial unique index (added in the migration) allows only one *pending*
 * request per rider per community, while keeping the full history of past
 * decisions for moderators.
 */
module.exports = (sequelize, DataTypes) => {
  const CommunityJoinRequest = sequelize.define(
    'CommunityJoinRequest',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      communityId: { type: DataTypes.UUID, allowNull: false },
      userId: { type: DataTypes.UUID, allowNull: false },
      message: { type: DataTypes.STRING(300), allowNull: true },
      status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
      },
      reviewedBy: { type: DataTypes.UUID, allowNull: true },
      reviewedAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'community_join_requests',
      indexes: [
        { fields: ['community_id', 'status'] },
        { fields: ['user_id'] },
      ],
    },
  );

  CommunityJoinRequest.associate = (db) => {
    CommunityJoinRequest.belongsTo(db.Community, { foreignKey: 'communityId', as: 'community' });
    CommunityJoinRequest.belongsTo(db.User, { foreignKey: 'userId', as: 'user' });
    CommunityJoinRequest.belongsTo(db.User, { foreignKey: 'reviewedBy', as: 'reviewer' });
  };

  return CommunityJoinRequest;
};
