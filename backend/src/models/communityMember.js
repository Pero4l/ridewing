'use strict';

/**
 * Membership of a community, including the role used for server-side
 * authorization. Clients never send roles — they are read from this table.
 */
module.exports = (sequelize, DataTypes) => {
  const CommunityMember = sequelize.define(
    'CommunityMember',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      communityId: { type: DataTypes.UUID, allowNull: false },
      userId: { type: DataTypes.UUID, allowNull: false },
      role: {
        type: DataTypes.ENUM('owner', 'admin', 'moderator', 'member'),
        allowNull: false,
        defaultValue: 'member',
      },
      status: {
        type: DataTypes.ENUM('active', 'left', 'banned'),
        allowNull: false,
        defaultValue: 'active',
      },
      joinedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      tableName: 'community_members',
      indexes: [
        {
          unique: true,
          fields: ['community_id', 'user_id'],
          name: 'community_members_community_user_unique',
        },
        { fields: ['user_id'] },
        { fields: ['community_id', 'status'] },
      ],
    },
  );

  CommunityMember.associate = (db) => {
    CommunityMember.belongsTo(db.Community, { foreignKey: 'communityId', as: 'community' });
    CommunityMember.belongsTo(db.User, { foreignKey: 'userId', as: 'user' });
  };

  return CommunityMember;
};
