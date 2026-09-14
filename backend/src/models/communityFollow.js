'use strict';

/**
 * Following a community is lighter than joining it: followers see the community
 * in their list but get no chat access. Membership is what grants permissions.
 */
module.exports = (sequelize, DataTypes) => {
  const CommunityFollow = sequelize.define(
    'CommunityFollow',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      communityId: { type: DataTypes.UUID, allowNull: false },
      userId: { type: DataTypes.UUID, allowNull: false },
    },
    {
      tableName: 'community_follows',
      updatedAt: false,
      indexes: [
        {
          unique: true,
          fields: ['community_id', 'user_id'],
          name: 'community_follows_community_user_unique',
        },
        { fields: ['user_id'] },
      ],
    },
  );

  CommunityFollow.associate = (db) => {
    CommunityFollow.belongsTo(db.Community, { foreignKey: 'communityId', as: 'community' });
    CommunityFollow.belongsTo(db.User, { foreignKey: 'userId', as: 'user' });
  };

  return CommunityFollow;
};
