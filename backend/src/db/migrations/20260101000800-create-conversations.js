'use strict';

/** Conversations, their members, and messages. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('conversations', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      type: { type: Sequelize.ENUM('direct', 'community'), allowNull: false },
      community_id: {
        type: Sequelize.UUID,
        allowNull: true,
        unique: true,
        references: { model: 'communities', key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      // Sorted "uuid:uuid" pair — makes duplicate direct threads impossible.
      direct_key: { type: Sequelize.STRING(73), allowNull: true, unique: true },
      last_message_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    // Conversation list ordering.
    await queryInterface.addIndex('conversations', ['last_message_at'], {
      name: 'conversations_last_message_at_idx',
    });

    // Each conversation type carries exactly the columns it needs.
    await queryInterface.sequelize.query(`
      ALTER TABLE "conversations"
      ADD CONSTRAINT "conversations_shape_matches_type"
      CHECK (
        ("type" = 'community' AND "community_id" IS NOT NULL AND "direct_key" IS NULL)
        OR
        ("type" = 'direct' AND "direct_key" IS NOT NULL AND "community_id" IS NULL)
      );
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('conversations');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_conversations_type";');
  },
};
