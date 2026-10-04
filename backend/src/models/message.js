'use strict';

const env = require('../config/env');
// Pure URL helpers, no model access — safe to pull in here so a shared post
// carries the same derived video poster frames as it does in the feed.
const { withPosters } = require('../services/media.service');

/**
 * A chat message.
 *
 * `clientNonce` makes sends idempotent: a rider whose connection drops mid-send
 * can safely retry, and we return the already-stored message instead of writing a
 * duplicate. The unique index is scoped per conversation.
 *
 * `sharedPostId` is what makes "share this post to a rider" a real send rather
 * than a link in a text bubble: the post travels with the message, so the
 * recipient sees the caption, media, likes and comments inline.
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
          // A message has to say something *or* carry a post. Forwarding a post
          // without adding a note is the common case, so the emptiness rule is on
          // the pair rather than on the text alone.
          notEmptyWithoutPost(value) {
            if (String(value ?? '').trim()) return;
            if (this.sharedPostId) return;
            throw new Error('Message cannot be empty');
          },
          withinLimit(value) {
            if (String(value ?? '').length > env.limits.maxMessageLength) {
              throw new Error(`Message cannot exceed ${env.limits.maxMessageLength} characters`);
            }
          },
        },
      },
      sharedPostId: { type: DataTypes.UUID, allowNull: true },
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
        { fields: ['shared_post_id'] },
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
    Message.belongsTo(db.Post, { foreignKey: 'sharedPostId', as: 'sharedPost' });
  };

  Message.prototype.toJSONSafe = function toJSONSafe() {
    return {
      id: this.id,
      conversationId: this.conversationId,
      senderId: this.senderId,
      content: this.content,
      sharedPostId: this.sharedPostId ?? null,
      sharedPost: this.sharedPost ? serializeSharedPost(this.sharedPost) : null,
      clientNonce: this.clientNonce,
      editedAt: this.editedAt,
      createdAt: this.createdAt,
      sender: this.sender ? this.sender.toPublicJSON() : undefined,
    };
  };

  return Message;
};

/**
 * The post as a chat bubble needs it: enough to render the card and open the post,
 * without the viewer-specific fields (did *this* rider like it) that only mean
 * something on a feed.
 */
function serializeSharedPost(post) {
  return {
    id: post.id,
    content: post.content ?? '',
    media: withPosters(post.media ?? []),
    likeCount: post.likeCount ?? 0,
    commentCount: post.commentCount ?? 0,
    createdAt: post.createdAt,
    user: post.user ? post.user.toPublicJSON() : null,
  };
}
