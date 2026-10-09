'use strict';

/**
 * Indexes `conversations.community_id`.
 *
 * Every other foreign key in the schema is indexed, and `community.service` and
 * `conversation.service` both look a community thread up by this column
 * (`Conversation.findOne({ where: { communityId } })`). It was the one outlier,
 * so that lookup was a sequential scan on a table that grows with every
 * community created.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      'CREATE INDEX IF NOT EXISTS "conversations_community_id" ON "conversations" ("community_id")',
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS "conversations_community_id"');
  },
};