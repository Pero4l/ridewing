'use strict';

/**
 * Lets a chat message carry a post.
 *
 * Sharing a post is "send it to a rider in their DM", so the post has to travel
 * with the message rather than as a line of text describing it. `content` stays
 * nullable-in-practice (empty string) — a shared post with no note is a normal
 * thing to send — so the column is unchanged and only the reference is added.
 *
 * `ON DELETE CASCADE` matches the rest of the schema's reaction tables: if the
 * author deletes the post, the shared copy in somebody's inbox goes with it
 * rather than leaving a dangling reference behind.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('messages', 'shared_post_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'posts', key: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });

    await queryInterface.addIndex('messages', ['shared_post_id'], {
      name: 'messages_shared_post_id_idx',
    });

    // The blank-content check was the whole reason a message needed words in it.
    // Now that a message can carry a post instead, the rule is "text or post",
    // which has to live in the database too — the model validator and the
    // request schema can both be bypassed, and a message with neither is not a
    // message.
    await queryInterface.sequelize.query(`
      ALTER TABLE "messages"
        DROP CONSTRAINT IF EXISTS "messages_content_not_blank";
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE "messages"
        ADD CONSTRAINT "messages_content_not_blank"
        CHECK (btrim("content") <> '' OR "shared_post_id" IS NOT NULL);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE "messages"
        DROP CONSTRAINT IF EXISTS "messages_content_not_blank";
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE "messages"
        ADD CONSTRAINT "messages_content_not_blank"
        CHECK (btrim("content") <> '');
    `);
    await queryInterface.removeIndex('messages', 'messages_shared_post_id_idx');
    await queryInterface.removeColumn('messages', 'shared_post_id');
  },
};
