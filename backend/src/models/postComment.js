'use strict';

module.exports = (sequelize, DataTypes) => {
  const PostComment = sequelize.define(
    'PostComment',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      postId: { type: DataTypes.UUID, allowNull: false },
      userId: { type: DataTypes.UUID, allowNull: false },
      content: { type: DataTypes.TEXT, allowNull: false },
    },
    {
      tableName: 'post_comments',
      indexes: [{ fields: ['post_id', 'created_at'] }],
    },
  );

  PostComment.associate = (db) => {
    PostComment.belongsTo(db.Post, { foreignKey: 'postId', as: 'post' });
    PostComment.belongsTo(db.User, { foreignKey: 'userId', as: 'user' });
  };

  return PostComment;
};