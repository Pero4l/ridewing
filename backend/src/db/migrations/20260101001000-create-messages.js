'use strict';

/** Chat messages. Soft-deleted so moderation keeps a record. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('messages', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      conversation_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'conversations', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      sender_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      content: { type: Sequelize.TEXT, allowNull: false },
      // Client-generated idempotency key: a retried send after a dropped socket
      // resolves to the existing row instead of a duplicate.
      client_nonce: { type: Sequelize.STRING(64), allowNull: true },
      edited_at: { type: Sequelize.DATE, allowNull: true },
      deleted_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    // The hot read path: newest messages in a conversation.
    await queryInterface.addIndex('messages', ['conversation_id', 'created_at'], {
      name: 'messages_conversation_created_at_idx',
    });
    await queryInterface.addIndex('messages', ['sender_id'], { name: 'messages_sender_id_idx' });

    // Idempotency is scoped per conversation, and only when a nonce was supplied.
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX "messages_conversation_nonce_unique"
      ON "messages" ("conversation_id", "client_nonce")
      WHERE "client_nonce" IS NOT NULL;
    `);

    // Reject blank content at the storage layer too.
    await queryInterface.sequelize.query(`
      ALTER TABLE "messages"
      ADD CONSTRAINT "messages_content_not_blank"
      CHECK (btrim("content") <> '');
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('messages');
  },
};
