'use strict';

module.exports = (sequelize, DataTypes) => {
  const Hashtag = sequelize.define(
    'Hashtag',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      tag: { type: DataTypes.STRING(100), allowNull: false, unique: true },
      postCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    },
    {
      tableName: 'hashtags',
      indexes: [
        { unique: true, fields: ['tag'] },
      ],
    },
  );

  Hashtag.associate = (db) => {
    Hashtag.belongsToMany(db.Post, { through: db.PostHashtag, foreignKey: 'hashtagId', as: 'posts' });
  };

  return Hashtag;
};