'use strict';

/**
 * A stored Web Push subscription (RFC 8030) for a user + device pair.
 *
 * The model follows the same factory shape as every other model in this
 * directory: `models/index.js` calls `define(sequelize, DataTypes)` and wires
 * associations, so this file must NOT construct its own connection.
 */

module.exports = (sequelize, DataTypes) => {
  const PushSubscription = sequelize.define(
    'PushSubscription',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      userId: { type: DataTypes.UUID, allowNull: false },
      deviceId: { type: DataTypes.STRING(255), allowNull: false },
      endpoint: { type: DataTypes.STRING(500), allowNull: false },
      p256dh: { type: DataTypes.TEXT, allowNull: false },
      auth: { type: DataTypes.TEXT, allowNull: false },
      userAgent: { type: DataTypes.STRING(500), allowNull: true },
      lastSeenDeviceAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'push_subscriptions',
      indexes: [{ unique: true, fields: ['userId', 'deviceId'] }],
    },
  );

  PushSubscription.associate = (db) => {
    PushSubscription.belongsTo(db.User, { foreignKey: 'userId', as: 'user' });
  };

  return PushSubscription;
};
