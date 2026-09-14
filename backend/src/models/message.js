'use strict';

const env = require('../config/env');

/**
 * A chat message.
 *
 * `clientNonce` makes sends idempotent: a rider whose connection drops mid-send
 * can safely retry, and we return the already-stored message instead of writing a
 * duplicate. The unique index is scoped per conversation.
 */
module.exports = (sequelize, DataTypes) => {
  const Message = sequelize.define(
    'Message',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      conversationId: { type: DataTypes.UUID, allowNull: false },
      senderId: { type: DataTypes.UUID, allowNull: false },
      content: {
        type: DataTypes.TEXT,
        allowNull: false,
        validate: {
          notEmptyAfterTrim(value) {
            if (!String(value ?? '').trim()) throw new Error('Message cannot be empty');
          },
          withinLimit(value) {
            if (String(value ?? '').length > env.limits.maxMessageLength) {
              throw new Error(`Message cannot exceed ${env.limits.maxMessageLength} characters`);
            }
          },
        },
      },
      clientNonce: { type: DataTypes.STRING(64), allowNull: true },
      editedAt: { type: DataTypes.DATE, allowNull: true },
      deletedAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'messages',
      paranoid: true, // soft delete: history stays intact for moderation
      indexes: [
        // Primary history read: newest-first within a conversation.
        { fields: ['conversation_id', 'created_at'] },
        { fields: ['sender_id'] },
        {
          unique: true,
          fields: ['conversation_id', 'client_nonce'],
          name: 'messages_conversation_nonce_unique',
        },
      ],
    },
  );

  Message.associate = (db) => {
    Message.belongsTo(db.Conversation, { foreignKey: 'conversationId', as: 'conversation' });
    Message.belongsTo(db.User, { foreignKey: 'senderId', as: 'sender' });
  };

  Message.prototype.toJSONSafe = function toJSONSafe() {
    return {
      id: this.id,
      conversationId: this.conversationId,
      senderId: this.senderId,
      content: this.content,
      clientNonce: this.clientNonce,
      editedAt: this.editedAt,
      createdAt: this.createdAt,
      sender: this.sender ? this.sender.toPublicJSON() : undefined,
    };
  };

  return Message;
};
