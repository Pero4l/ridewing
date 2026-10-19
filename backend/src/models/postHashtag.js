'use strict';

module.exports = (sequelize, DataTypes) => {
  const PostHashtag = sequelize.define(
    'PostHashtag',
    {
      postId: { type: DataTypes.UUID, allowNull: false, primaryKey: true },
      hashtagId: { type: DataTypes.UUID, allowNull: false, primaryKey: true },
    },
    {
      tableName: 'post_hashtags',
      timestamps: true,
      createdAt: 'createdAt',
      updatedAt: false,
    },
  );

  PostHashtag.associate = (db) => {
    PostHashtag.belongsTo(db.Post, { foreignKey: 'postId', as: 'post' });
    PostHashtag.belongsTo(db.Hashtag, { foreignKey: 'hashtagId', as: 'hashtag' });
  };

  return PostHashtag;
};