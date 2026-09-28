'use strict';

/**
 * In-app notification. Delivered over Socket.IO when the rider is connected and
 * fetched over HTTP otherwise, so nothing is lost while offline.
 */
module.exports = (sequelize, DataTypes) => {
  const Notification = sequelize.define(
    'Notification',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      userId: { type: DataTypes.UUID, allowNull: false },
      type: {
        // Kept in step with the Postgres enum, which grows in migrations
        // 01700 (post_like, post_comment, post_share), 01900 (comment_reply),
        // 02500 (support_ticket) and 02700 (ride_signal). A type missing here is
        // rejected by the model before it can be written, even though the
        // column allows it.
        type: DataTypes.ENUM(
          'follow',
          'community_join_request',
          'community_join_approved',
          'community_join_rejected',
          'community_role_changed',
          'ride_invite',
          'message',
          'post_like',
          'post_comment',
          'post_share',
          'comment_reply',
          'support_ticket',
          'ride_signal',
        ),
        allowNull: false,
      },
      actorId: { type: DataTypes.UUID, allowNull: true },
      // Loose reference to whatever the notification points at.
      entityType: { type: DataTypes.STRING(40), allowNull: true },
      entityId: { type: DataTypes.UUID, allowNull: true },
      data: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      readAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'notifications',
      indexes: [
        { fields: ['user_id', 'created_at'] },
        { fields: ['user_id', 'read_at'] },
      ],
    },
  );

  Notification.associate = (db) => {
    Notification.belongsTo(db.User, { foreignKey: 'userId', as: 'recipient' });
    Notification.belongsTo(db.User, { foreignKey: 'actorId', as: 'actor' });
  };

  Notification.prototype.toJSONSafe = function toJSONSafe() {
    return {
      id: this.id,
      type: this.type,
      actorId: this.actorId,
      entityType: this.entityType,
      entityId: this.entityId,
      data: this.data,
      readAt: this.readAt,
      createdAt: this.createdAt,
      actor: this.actor ? this.actor.toPublicJSON() : undefined,
    };
  };

  return Notification;
};
