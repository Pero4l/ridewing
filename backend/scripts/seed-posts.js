'use strict';

/**
 * One-off demo seeder: makes the social feed look alive for local development.
 *
 *   node scripts/seed-posts.js
 *
 * Idempotent-ish: it skips planting if posts already exist beyond a small
 * baseline (i.e. a previous run did the work). Re-running simply tops up any
 * missing follow edges. Safe against `db:seed` reruns because it goes through
 * the models directly, never "duplicating" the user/community seeder.
 */

const { sequelize, User, Post, PostLike, PostComment, PostShare, Follow } = require('../src/models');

const RIDERS = ['ptb', 'maya', 'dev', 'sam'];

const POSTS = [
  {
    username: 'ptb',
    hoursAgo: 22,
    content: 'Coffee stop before the rain. Plan was 300kms, we did 380. No regrets.',
    media: [img('ptb-coffee', 1200, 800)],
  },
  {
    username: 'ptb',
    hoursAgo: 6,
    content: 'Low-light blitz after work. These mountain roads never get old.',
    media: [img('ptb-dusk', 1200, 800)],
  },
  {
    username: 'maya',
    hoursAgo: 30,
    content: 'Dusty weekend on the ADV. Airbox full of gravel, zero complaints. Anyone up for Oyster Bay on Sunday? Leaving 7:30 sharp.',
    media: [img('maya-adv', 1200, 800)],
  },
  {
    username: 'maya',
    hoursAgo: 3,
    content: 'Sunday ride confirmed — Oyster Bay, 0700 at the shell. Bring a thermos.',
  },
  {
    username: 'dev',
    hoursAgo: 44,
    content: 'Track evening. Two sessions on slicks, then I called it honest. Times are dropping, the ego is healing.',
    media: [img('dev-track', 1200, 800)],
  },
  {
    username: 'dev',
    hoursAgo: 11,
    content: 'Swapped bar mirrors for clip-ons. Feels like a whole new bike — first corner I giggled out loud.',
    media: [img('dev-clipons', 1200, 800)],
  },
  {
    username: 'sam',
    hoursAgo: 18,
    content: 'Rain gear finally earned its keep today. 150 wet kilometres and still capable of smiling.',
  },
  {
    username: 'sam',
    hoursAgo: 2,
    content: 'New tires, fresh brake lines, clean chain. Tomorrow morning is the whole reason I own a motorcycle.',
    media: [img('sam-fresh', 1200, 800)],
  },
];

const LIKES = [
  ['ptb', 'maya', 0],
  ['ptb', 'dev', 0],
  ['maya', 'ptb', 1],
  ['dev', 'ptb', 1],
  ['sam', 'ptb', 1],
  ['maya', 'dev', 4],
  ['sam', 'maya', 2],
  ['dev', 'sam', 7],
  ['ptb', 'sam', 7],
  ['sam', 'dev', 5],
];

const COMMENTS = [
  ['dev', 1, 'That last hairpin looked tasty.'],
  ['maya', 5, 'Slicks in evening heat. Brave.'],
  ['ptb', 5, 'Chasing the same knee-down ghost.'],
  ['sam', 2, 'Oyster Bay, count me in.'],
  ['maya', 2, 'Thermos duty: assigned to dev.'],
];

const SHARES = [
  ['sam', 1],
  ['maya', 3],
];

function img(seed, width, height) {
  return { url: `https://picsum.photos/seed/ridewing-${seed}/${width}/${height}`, type: 'image', width, height };
}

async function main() {
  const users = await User.findAll({ where: { username: RIDERS } });
  if (users.length !== RIDERS.length) {
    console.error(`Expected ${RIDERS.length} demo riders, found ${users.length}. Run db:seed first.`);
    process.exit(1);
  }
  const byName = new Map(users.map((u) => [u.username, u]));

  const existing = await Post.count();
  if (existing > 2) {
    console.log(`Already ${existing} posts on the feed — skipping plant (idempotent guard).`);
    if (process.argv[2] !== '--force') {
      console.log('Run with --force to plant anyway.');
      return;
    }
    console.log('--force: planting anyway.');
  }

  await sequelize.transaction(async (transaction) => {
    // Complete follow graph so every demo rider sees every demo rider's feed.
    for (const a of RIDERS) {
      for (const b of RIDERS) {
        if (a === b) continue;
        await Follow.findOrCreate({
          where: { followerId: byName.get(a).id, followingId: byName.get(b).id },
          defaults: { followerId: byName.get(a).id, followingId: byName.get(b).id },
          transaction,
        });
      }
    }

    const now = Date.now();
    const postRows = [];
    for (const def of POSTS) {
      const createdAt = new Date(now - def.hoursAgo * 3600_000);
      const post = await Post.create(
        {
          userId: byName.get(def.username).id,
          content: def.content,
          media: def.media ?? [],
          likeCount: 0,
          commentCount: 0,
          shareCount: 0,
          createdAt,
          updatedAt: createdAt,
        },
        { transaction },
      );
      postRows.push(post);
    }

    let likes = 0;
    for (const [liker, owner, postIndex] of LIKES) {
      const post = postRows[postIndex];
      const [row, created] = await PostLike.findOrCreate({
        where: { postId: post.id, userId: byName.get(liker).id },
        defaults: { postId: post.id, userId: byName.get(liker).id, createdAt: post.createdAt },
        transaction,
      });
      if (created) {
        await Post.increment('likeCount', { by: 1, where: { id: post.id }, transaction });
        likes += 1;
      }
    }

    let comments = 0;
    for (const [author, postIndex, text] of COMMENTS) {
      const post = postRows[postIndex];
      await PostComment.create(
        {
          postId: post.id,
          userId: byName.get(author).id,
          content: text,
          createdAt: new Date(post.createdAt.getTime() + 60_000),
        },
        { transaction },
      );
      await Post.increment('commentCount', { by: 1, where: { id: post.id }, transaction });
      comments += 1;
    }

    let shares = 0;
    for (const [author, postIndex] of SHARES) {
      const post = postRows[postIndex];
      const [, created] = await PostShare.findOrCreate({
        where: { postId: post.id, userId: byName.get(author).id },
        defaults: { postId: post.id, userId: byName.get(author).id, createdAt: post.createdAt },
        transaction,
      });
      if (created) {
        await Post.increment('shareCount', { by: 1, where: { id: post.id }, transaction });
        shares += 1;
      }
    }

    console.log(
      `Seeded feed: ${postRows.length} posts, ${likes} likes, ${comments} comments, ${shares} shares.`,
    );
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });