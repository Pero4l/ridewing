'use strict';

module.exports = (sequelize, DataTypes) => {
  const PostShare = sequelize.define(
    'PostShare',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      postId: { type: DataTypes.UUID, allowNull: false },
      userId: { type: DataTypes.UUID, allowNull: false },
    },
    {
      tableName: 'post_shares',
      indexes: [{ unique: true, fields: ['post_id', 'user_id'] }],
    },
  );

  PostShare.associate = (db) => {
    PostShare.belongsTo(db.Post, { foreignKey: 'postId', as: 'post' });
    PostShare.belongsTo(db.User, { foreignKey: 'userId', as: 'user' });
  };

  return PostShare;
};