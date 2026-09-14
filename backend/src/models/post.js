'use strict';

module.exports = (sequelize, DataTypes) => {
  const Post = sequelize.define(
    'Post',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      userId: { type: DataTypes.UUID, allowNull: false },
      content: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
      // Array of { url, type: 'image'|'video', width?, height? }.
      media: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      likeCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      commentCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      shareCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      editedAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'posts',
      indexes: [
        { fields: ['user_id', 'created_at'] },
        { fields: ['created_at'] },
      ],
    },
  );

  Post.associate = (db) => {
    Post.belongsTo(db.User, { foreignKey: 'userId', as: 'user' });
    Post.hasMany(db.PostLike, { foreignKey: 'postId', as: 'likes' });
    Post.hasMany(db.PostComment, { foreignKey: 'postId', as: 'comments' });
    Post.hasMany(db.PostShare, { foreignKey: 'postId', as: 'shares' });
  };

  return Post;
};