'use strict';

/**
 * Directed follow edge. The composite unique constraint makes double-follows
 * impossible at the database level rather than relying on a prior SELECT.
 */
module.exports = (sequelize, DataTypes) => {
  const Follow = sequelize.define(
    'Follow',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      followerId: { type: DataTypes.UUID, allowNull: false },
      followingId: { type: DataTypes.UUID, allowNull: false },
    },
    {
      tableName: 'follows',
      updatedAt: false,
      indexes: [
        { unique: true, fields: ['follower_id', 'following_id'], name: 'follows_follower_following_unique' },
        { fields: ['following_id'] },
      ],
      validate: {
        noSelfFollow() {
          if (this.followerId === this.followingId) {
            throw new Error('A rider cannot follow themselves');
          }
        },
      },
    },
  );

  Follow.associate = (db) => {
    Follow.belongsTo(db.User, { foreignKey: 'followerId', as: 'follower' });
    Follow.belongsTo(db.User, { foreignKey: 'followingId', as: 'following' });
  };

  return Follow;
};
