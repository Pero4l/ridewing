'use strict';

/**
 * Reposts, as distinct from shares.
 *
 * "Share" already existed and means "send this to my followers" — a broadcast
 * that leaves no trace on the sharer's profile. A repost is the other thing
 * riders mean by the button: put it on my own profile, attributed to whoever
 * actually made it. Conflating the two made the profile's shared tab
 * unattributable, so the two now live in the same table behind a `kind`
 * discriminator and are counted separately.
 *
 * Existing rows are all shares, hence the default and the backfill below being
 * the same value.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('post_shares', 'kind', {
      type: Sequelize.STRING(16),
      allowNull: false,
      defaultValue: 'share',
    });

    // One rider may share and repost the same post, so the uniqueness rule is
    // now per-kind rather than per-post.
    await queryInterface.removeIndex('post_shares', 'post_shares_post_user_unique');
    await queryInterface.addIndex('post_shares', ['post_id', 'user_id', 'kind'], {
      name: 'post_shares_post_user_kind_unique',
      unique: true,
    });

    // "Reposted by" needs a cheap way to say "you have reposted this" without
    // counting the table on every card in the feed.
    await queryInterface.addColumn('posts', 'repost_count', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    // The profile's reposts tab.
    await queryInterface.addIndex('post_shares', ['user_id', 'kind', 'created_at'], {
      name: 'post_shares_user_kind_created_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('post_shares', 'post_shares_user_kind_created_idx');
    await queryInterface.removeColumn('posts', 'repost_count');
    await queryInterface.removeIndex('post_shares', 'post_shares_post_user_kind_unique');
    await queryInterface.addIndex('post_shares', ['post_id', 'user_id'], {
      name: 'post_shares_post_user_unique',
      unique: true,
    });
    await queryInterface.removeColumn('post_shares', 'kind');
  },
};
