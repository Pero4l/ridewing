'use strict';

/**
 * A message thread — either a direct conversation between two riders or the
 * single chat attached to a community.
 *
 * `directKey` is the sorted pair of user ids for direct threads. A unique index on
 * it means two riders opening a chat simultaneously converge on one conversation
 * instead of creating duplicates.
 */
module.exports = (sequelize, DataTypes) => {
  const Conversation = sequelize.define(
    'Conversation',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      type: { type: DataTypes.ENUM('direct', 'community'), allowNull: false },
      communityId: { type: DataTypes.UUID, allowNull: true },
      directKey: { type: DataTypes.STRING(73), allowNull: true, unique: true },
      lastMessageAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'conversations',
      indexes: [
        { unique: true, fields: ['direct_key'] },
        { unique: true, fields: ['community_id'] },
        { fields: ['last_message_at'] },
      ],
      validate: {
        shapeMatchesType() {
          if (this.type === 'community' && !this.communityId) {
            throw new Error('Community conversations require a communityId');
          }
          if (this.type === 'direct' && !this.directKey) {
            throw new Error('Direct conversations require a directKey');
          }
        },
      },
    },
  );

  /** Stable key for a pair of riders, independent of who initiated. */
  Conversation.directKeyFor = (userIdA, userIdB) => [userIdA, userIdB].sort().join(':');

  Conversation.associate = (db) => {
    Conversation.belongsTo(db.Community, { foreignKey: 'communityId', as: 'community' });
    Conversation.hasMany(db.ConversationMember, { foreignKey: 'conversationId', as: 'members' });
    Conversation.hasMany(db.Message, { foreignKey: 'conversationId', as: 'messages' });
  };

  return Conversation;
};
