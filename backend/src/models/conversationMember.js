'use strict';

/**
 * Participation in a conversation. This table is the authorization record for
 * both HTTP history reads and Socket.IO room joins.
 */
module.exports = (sequelize, DataTypes) => {
  const ConversationMember = sequelize.define(
    'ConversationMember',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      conversationId: { type: DataTypes.UUID, allowNull: false },
      userId: { type: DataTypes.UUID, allowNull: false },
      lastReadAt: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'conversation_members',
      indexes: [
        {
          unique: true,
          fields: ['conversation_id', 'user_id'],
          name: 'conversation_members_conversation_user_unique',
        },
        { fields: ['user_id'] },
      ],
    },
  );

  ConversationMember.associate = (db) => {
    ConversationMember.belongsTo(db.Conversation, { foreignKey: 'conversationId', as: 'conversation' });
    ConversationMember.belongsTo(db.User, { foreignKey: 'userId', as: 'user' });
  };

  return ConversationMember;
};
