'use strict';

module.exports = (sequelize, DataTypes) => {
  const CommentLike = sequelize.define(
    'CommentLike',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      commentId: { type: DataTypes.UUID, allowNull: false },
      userId: { type: DataTypes.UUID, allowNull: false },
    },
    {
      tableName: 'comment_likes',
      indexes: [
        { unique: true, fields: ['comment_id', 'user_id'] },
        { fields: ['user_id', 'created_at'] },
      ],
    },
  );

  CommentLike.associate = (db) => {
    CommentLike.belongsTo(db.PostComment, { foreignKey: 'commentId', as: 'comment' });
    CommentLike.belongsTo(db.User, { foreignKey: 'userId', as: 'user' });
  };

  return CommentLike;
};