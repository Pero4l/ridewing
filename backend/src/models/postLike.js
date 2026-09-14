'use strict';

module.exports = (sequelize, DataTypes) => {
  const PostLike = sequelize.define(
    'PostLike',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      postId: { type: DataTypes.UUID, allowNull: false },
      userId: { type: DataTypes.UUID, allowNull: false },
    },
    {
      tableName: 'post_likes',
      indexes: [{ unique: true, fields: ['post_id', 'user_id'] }],
    },
  );

  PostLike.associate = (db) => {
    PostLike.belongsTo(db.Post, { foreignKey: 'postId', as: 'post' });
    PostLike.belongsTo(db.User, { foreignKey: 'userId', as: 'user' });
  };

  return PostLike;
};