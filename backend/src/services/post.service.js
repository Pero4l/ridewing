'use strict';

/**
 * Short-form posts: create, feed, like, comment, share.
 *
 * Counters are denormalized on `posts` and mutated inside the same transaction
 * as the like/comment/share row so the two can never drift. Notifications are
 * fired after commit.
 */

const { Op } = require('sequelize');

const {
  sequelize,
  Post,
  PostLike,
  PostComment,
  CommentLike,
  PostShare,
  Follow,
  User,
} = require('../models');
const ApiError = require('../utils/ApiError');
const { normalizeLimit, decodeCursor, buildPage } = require('../utils/pagination');
const notificationService = require('./notification.service');
const emailService = require('./email.service');
const { withPosters } = require('./media.service');

const MAX_MEDIA_ITEMS = 9;

/** Photos and videos can only be changed shortly after posting; text is always editable. */
const MEDIA_EDIT_WINDOW_MS = 10 * 60 * 1000;

function mediaSignature(media) {
  return (media ?? []).map((item) => `${item.type}:${item.url}:${item.width ?? ''}:${item.height ?? ''}`).join('|');
}

/** Photos and videos are editable only within the short window after posting. */
function canEditMedia(createdAt, now = Date.now()) {
  return now - new Date(createdAt).getTime() < MEDIA_EDIT_WINDOW_MS;
}

/** Validates client-supplied media into a normalized shape. */
function sanitizeMedia(rawMedia) {
  if (rawMedia === undefined || rawMedia === null) return [];
  if (!Array.isArray(rawMedia)) throw ApiError.badRequest('Media must be a list');

  const images = [];
  const videos = [];
  for (const item of rawMedia) {
    const entry = item && typeof item === 'object' ? item : {};
    if (typeof entry.url !== 'string' || !entry.url) continue;
    const type = entry.type === 'video' ? 'video' : 'image';
    const normalized = { url: entry.url, type };
    if (Number.isFinite(Number(entry.width))) normalized.width = Number(entry.width);
    if (Number.isFinite(Number(entry.height))) normalized.height = Number(entry.height);
    if (type === 'video') {
      videos.push(normalized);
    } else {
      images.push(normalized);
    }
  }

  if (videos.length > 1) throw ApiError.badRequest('A post can include at most one video');
  if (images.length > MAX_MEDIA_ITEMS) {
    throw ApiError.badRequest(`A post can include at most ${MAX_MEDIA_ITEMS} photos`);
  }
  if (videos.length && images.length > 9) {
    throw ApiError.badRequest('A post with a video can include at most 9 photos');
  }
  return [...images, ...videos];
}

async function create(userId, { content, media: rawMedia }) {
  const contentText = String(content ?? '').trim();
  const media = sanitizeMedia(rawMedia);

  if (!contentText && media.length === 0) {
    throw ApiError.badRequest('Write something or add a photo');
  }
  if (contentText.length > 2000) {
    throw ApiError.badRequest('A post cannot exceed 2000 characters');
  }

  const post = await Post.create({ userId, content: contentText, media, likeCount: 0, commentCount: 0, shareCount: 0 });
  post.user = await User.findByPk(userId);

  emailService.alertAdmins({
    subject: 'RideWing: new post created',
    text: `A new post was published by @${post.user?.username ?? userId}.`,
    html: emailService.renderHtml({
      title: 'New post published',
      paragraphs: [
        `Author: @${post.user?.username ?? userId}`,
        `Content: ${contentText.slice(0, 200) || '—'}`,
        `Media items: ${media.length}`,
      ],
    }),
  });

  return toJSON(post, { viewerLiked: false });
}

async function loadPostOrThrow(postId) {
  const post = await Post.findByPk(postId, {
    include: [{ model: User, as: 'user' }],
  });
  if (!post) throw ApiError.notFound('Post not found');
  return post;
}

async function update(postId, userId, { content, media: rawMedia }) {
  const post = await Post.findByPk(postId, {
    include: [{ model: User, as: 'user' }],
  });
  if (!post) throw ApiError.notFound('Post not found');
  if (post.userId !== userId) throw ApiError.forbidden('You can only edit your own posts');

  const contentText = String(content ?? '').trim();
  const media = sanitizeMedia(rawMedia);

  if (!contentText && media.length === 0) {
    throw ApiError.badRequest('Write something or add a photo');
  }
  if (contentText.length > 2000) {
    throw ApiError.badRequest('A post cannot exceed 2000 characters');
  }

  const mediaEditable = canEditMedia(post.createdAt);
  const mediaChanged = mediaSignature(post.media) !== mediaSignature(media);
  if (mediaChanged && !mediaEditable) {
    throw ApiError.badRequest(
      'Photos and videos can only be changed within 10 minutes of posting. You can still edit the text.',
    );
  }

  post.content = contentText;
  if (mediaEditable) {
    post.media = media;
  }
  post.editedAt = new Date();
  await post.save();

  const liked = await PostLike.findOne({ where: { postId: post.id, userId }, attributes: ['id'] });
  return toJSON(post, { viewerLiked: Boolean(liked) });
}

/**
 * `viewerId` is optional: the feed and post detail are readable by a signed-out
 * visitor. Sequelize drops `undefined` from a `where` clause, which would turn
 * these "did I like this?" lookups into an unfiltered scan and match somebody
 * else's like, so anonymous is normalized to an explicit `null` that no row can
 * satisfy.
 */
const ANONYMOUS_VIEWER = null;

async function getPost(postId, viewerId) {
  const viewer = viewerId ?? ANONYMOUS_VIEWER;
  const post = await loadPostOrThrow(postId);
  const [liked, followRow, reposted] = await Promise.all([
    viewer ? PostLike.findOne({ where: { postId: post.id, userId: viewer }, attributes: ['id'] }) : null,
    !viewer || post.userId === viewer
      ? null
      : Follow.findOne({ where: { followerId: viewer, followingId: post.userId }, attributes: ['id'] }),
    viewer
      ? PostShare.findOne({ where: { postId: post.id, userId: viewer, kind: 'repost' }, attributes: ['id'] })
      : null,
  ]);
  return toJSON(post, {
    viewerLiked: Boolean(liked),
    viewerIsFollowingAuthor: Boolean(followRow),
    viewerReposted: Boolean(reposted),
  });
}

async function feed(userId, { limit, cursor } = {}) {
  const pageSize = normalizeLimit(limit, 20);
  const decoded = decodeCursor(cursor);
  const viewer = userId ?? ANONYMOUS_VIEWER;

  // Facebook-style feed: every rider's posts, newest first, so riders always
  // have something new to scroll even before they follow anyone.
  const where = {};
  if (decoded?.createdAt) where.createdAt = { [Op.lt]: new Date(decoded.createdAt) };

  const rows = await Post.findAll({
    where,
    include: [{ model: User, as: 'user' }],
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    limit: pageSize + 1,
  });

  const page = buildPage(rows, pageSize, (row) => ({ createdAt: row.createdAt.toISOString() }));

  // Two batched lookups avoid an N+1 for "did I like this?" and "is this
  // author someone I already follow?" across the whole page.
  const postIds = page.items.map((post) => post.id);
  const authorIds = page.items.map((post) => post.userId);

  const [likedRows, followingRows, repostedRows] = await Promise.all([
    viewer && postIds.length
      ? PostLike.findAll({ where: { postId: { [Op.in]: postIds }, userId: viewer }, attributes: ['postId'] })
      : [],
    viewer && authorIds.length
      ? Follow.findAll({
          where: { followerId: viewer, followingId: { [Op.in]: authorIds } },
          attributes: ['followingId'],
        })
      : [],
    viewer && postIds.length
      ? PostShare.findAll({
          where: { postId: { [Op.in]: postIds }, userId: viewer, kind: 'repost' },
          attributes: ['postId'],
        })
      : [],
  ]);
  const likedSet = new Set(likedRows.map((row) => row.postId));
  const followingSet = new Set(followingRows.map((row) => row.followingId));
  const repostedSet = new Set(repostedRows.map((row) => row.postId));

  return {
    items: page.items.map((post) =>
      toJSON(post, {
        viewerLiked: likedSet.has(post.id),
        viewerIsFollowingAuthor: followingSet.has(post.userId),
        viewerReposted: repostedSet.has(post.id),
      }),
    ),
    pageInfo: page.pageInfo,
  };
}

async function like(postId, userId) {
  return sequelize.transaction(async (transaction) => {
    const post = await Post.findByPk(postId, { transaction });
    if (!post) throw ApiError.notFound('Post not found');

    await PostLike.findOrCreate({ where: { postId, userId }, defaults: { postId, userId }, transaction });
    await Post.increment('likeCount', { by: 1, where: { id: postId }, transaction });

    transaction.afterCommit(() =>
      notificationService.create({
        userId: post.userId,
        actorId: userId,
        type: 'post_like',
        entityType: 'post',
        entityId: postId,
        data: { postId },
      }),
    );
    return { liked: true };
  });
}

async function unlike(postId, userId) {
  const removed = await PostLike.destroy({ where: { postId, userId } });
  if (removed) {
    await Post.decrement('likeCount', { by: 1, where: { id: postId } });
  }
  return { liked: false };
}

async function likeComment(commentId, userId) {
  return sequelize.transaction(async (transaction) => {
    const comment = await PostComment.findByPk(commentId, { transaction });
    if (!comment) throw ApiError.notFound('Comment not found');

    await CommentLike.findOrCreate({ where: { commentId, userId }, defaults: { commentId, userId }, transaction });
    await PostComment.increment('likeCount', { by: 1, where: { id: commentId }, transaction });

    transaction.afterCommit(() =>
      notificationService.create({
        userId: comment.userId,
        actorId: userId,
        type: 'comment_like',
        entityType: 'comment',
        entityId: commentId,
        data: { commentId },
      }),
    );
    return { liked: true };
  });
}

async function unlikeComment(commentId, userId) {
  const removed = await CommentLike.destroy({ where: { commentId, userId } });
  if (removed) {
    await PostComment.decrement('likeCount', { by: 1, where: { id: commentId } });
  }
  return { liked: false };
}

async function listComments(postId, { limit, cursor } = {}, viewerId) {
  await loadPostOrThrow(postId);

  const pageSize = normalizeLimit(limit, 20);
  const decoded = decodeCursor(cursor);
  const where = { postId };
  if (decoded?.createdAt) where.createdAt = { [Op.lt]: new Date(decoded.createdAt) };

  const rows = await PostComment.findAll({
    where,
    include: [{ model: User, as: 'user' }],
    order: [['createdAt', 'ASC'], ['id', 'ASC']],
    limit: pageSize + 1,
  });

  const commentIds = rows.map((row) => row.id);
  let likedSet = new Set();
  if (viewerId && commentIds.length) {
    const likedRows = await CommentLike.findAll({
      where: { commentId: { [Op.in]: commentIds }, userId: viewerId },
      attributes: ['commentId'],
    });
    likedSet = new Set(likedRows.map((row) => row.commentId));
  }

  const items = rows.map((row) => ({
    id: row.id,
    postId: row.postId,
    parentId: row.parentId ?? null,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    likeCount: row.likeCount,
    viewerLiked: likedSet.has(row.id),
    user: row.user ? row.user.toPublicJSON() : null,
  }));

  const hasMore = items.length > pageSize;
  const sliced = hasMore ? items.slice(0, pageSize) : items;
  const last = sliced[sliced.length - 1];
  return {
    items: sliced,
    pageInfo: { hasMore, nextCursor: hasMore && last ? last.createdAt : null },
  };
}

async function addComment(postId, userId, rawContent, parentId) {
  const content = String(rawContent ?? '').trim();
  if (!content) throw ApiError.badRequest('Comment cannot be empty');
  if (content.length > 1000) throw ApiError.badRequest('Comment cannot exceed 1000 characters');

  return sequelize.transaction(async (transaction) => {
    const post = await Post.findByPk(postId, { transaction });
    if (!post) throw ApiError.notFound('Post not found');

    let parent = null;
    if (parentId) {
      parent = await PostComment.findByPk(parentId, { transaction });
      if (!parent) throw ApiError.badRequest('The comment being replied to no longer exists');
      if (parent.postId !== postId) throw ApiError.badRequest('Cannot reply across different posts');
    }

    const comment = await PostComment.create({ postId, userId, content, parentId: parent?.id ?? null }, { transaction });
    await Post.increment('commentCount', { by: 1, where: { id: postId }, transaction });

    // Attach the author before the transaction lands so the freshly created
    // comment shows a real name immediately instead of a "Someone" placeholder.
    const author = await User.findByPk(userId, { transaction });

    transaction.afterCommit(() => {
      notificationService.create({
        userId: post.userId,
        actorId: userId,
        type: 'post_comment',
        entityType: 'post',
        entityId: postId,
        data: { postId, commentId: comment.id },
      });
      // A reply notifies the author of the comment being replied to. create()
      // skips actors notifying themselves.
      if (parent && parent.userId !== post.userId) {
        notificationService.create({
          userId: parent.userId,
          actorId: userId,
          type: 'comment_reply',
          entityType: 'comment',
          entityId: parent.id,
          data: { postId, commentId: comment.id },
        });
      }
    });

    return {
      comment: {
        id: comment.id,
        postId: comment.postId,
        parentId: comment.parentId ?? null,
        content: comment.content,
        createdAt: comment.createdAt.toISOString(),
        likeCount: 0,
        viewerLiked: false,
        user: author ? author.toPublicJSON() : null,
      },
    };
  });
}

/** "Share" records that this rider passed the post on (repost). */
/**
 * `share` broadcasts a post to the sharer's followers; `repost` puts it on
 * their own profile. They are separate intents with separate counts, so they
 * share a helper rather than a code path — the only differences are the `kind`,
 * the counter column, and the notification.
 *
 * Both are idempotent. `findOrCreate` reports whether it inserted, and the
 * counter is only moved when it did — the previous unconditional `increment`
 * inflated the number every time somebody tapped share twice.
 */
async function addInteraction(postId, userId, { kind, counter, notify }) {
  return sequelize.transaction(async (transaction) => {
    const post = await Post.findByPk(postId, { transaction });
    if (!post) throw ApiError.notFound('Post not found');

    const [row, created] = await PostShare.findOrCreate({
      where: { postId, userId, kind },
      defaults: { postId, userId, kind },
      transaction,
    });
    if (!created) return { active: true, alreadyDone: true };

    // `counter` is the raw column, so the interpolation into the SQL below and
    // the attribute name here stay in one place.
    await sequelize.query(`UPDATE posts SET ${counter} = ${counter} + 1 WHERE id = :id`, {
      replacements: { id: postId },
      transaction,
    });

    // Reposting your own post is a no-op as far as the author is concerned, and
    // the notification service would drop it anyway; the early return just avoids
    // the write.
    if (notify && post.userId !== userId) {
      transaction.afterCommit(() =>
        notificationService.create({
          userId: post.userId,
          actorId: userId,
          type: 'post_share',
          entityType: 'post',
          entityId: postId,
          data: { postId, kind },
        }),
      );
    }
    return { active: true, alreadyDone: false };
  });
}

async function removeInteraction(postId, userId, { kind, counter }) {
  return sequelize.transaction(async (transaction) => {
    const post = await Post.findByPk(postId, { transaction });
    if (!post) throw ApiError.notFound('Post not found');

    const destroyed = await PostShare.destroy({ where: { postId, userId, kind }, transaction });
    if (destroyed > 0) {
      // GREATEST guards against the counter drifting negative if the row count
      // and the cached counter ever disagree.
      await sequelize.query(
        `UPDATE posts SET ${counter} = GREATEST(${counter} - 1, 0) WHERE id = :id`,
        { replacements: { id: postId }, transaction },
      );
    }
    return { active: false };
  });
}

async function share(postId, userId) {
  return addInteraction(postId, userId, { kind: 'share', counter: 'share_count', notify: true });
}

async function repost(postId, userId) {
  return addInteraction(postId, userId, { kind: 'repost', counter: 'repost_count', notify: true });
}

async function unrepost(postId, userId) {
  return removeInteraction(postId, userId, { kind: 'repost', counter: 'repost_count' });
}

async function remove(postId, userId) {
  const post = await Post.findByPk(postId, { attributes: ['id', 'userId'] });
  if (!post) throw ApiError.notFound('Post not found');
  if (post.userId !== userId) throw ApiError.forbidden('You can only delete your own posts');
  await post.destroy();
  return { deleted: true };
}

/**
 * A rider's profile collections: posts they wrote, posts they shared (reposts),
 * and posts that tag them (@username in the text).
 */
async function userPosts(username, { tab = 'posts', viewerId } = {}) {
  const user = await User.findOne({ where: { username: String(username).toLowerCase() } });
  if (!user) throw ApiError.notFound('Rider not found');

  let rows;
  // Who reposted, so a card in this tab can be labelled. Filled in below.
  let reposters = new Map();
  if (tab === 'reposts') {
    const reposts = await PostShare.findAll({
      where: { userId: user.id, kind: 'repost' },
      order: [['createdAt', 'DESC']],
      limit: 100,
    });
    const postIds = reposts.map((share) => share.postId);
    reposters = new Map(reposts.map((share) => [share.postId, user]));
    rows = postIds.length
      ? await Post.findAll({ where: { id: { [Op.in]: postIds } }, include: [{ model: User, as: 'user' }] })
      : [];
    rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } else if (tab === 'shared') {
    const shares = await PostShare.findAll({
      where: { userId: user.id, kind: 'share' },
      attributes: ['postId'],
      order: [['createdAt', 'DESC']],
      limit: 100,
    });
    const postIds = shares.map((share) => share.postId);
    rows = postIds.length
      ? await Post.findAll({ where: { id: { [Op.in]: postIds } }, include: [{ model: User, as: 'user' }] })
      : [];
    rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } else if (tab === 'tagged') {
    rows = await Post.findAll({
      where: { content: { [Op.iLike]: `%@${user.username}%` } },
      include: [{ model: User, as: 'user' }],
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      limit: 100,
    });
  } else {
    rows = await Post.findAll({
      where: { userId: user.id },
      include: [{ model: User, as: 'user' }],
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      limit: 100,
    });
  }

  // Batch lookup for viewerLiked if viewerId provided
  let likedSet = new Set();
  if (viewerId && rows.length) {
    const postIds = rows.map((post) => post.id);
    const likedRows = await PostLike.findAll({
      where: { postId: { [Op.in]: postIds }, userId: viewerId },
      attributes: ['postId'],
    });
    likedSet = new Set(likedRows.map((row) => row.postId));
  }

  // Batch lookup for viewerReposted (reposts)
  let repostedSet = new Set();
  if (viewerId && rows.length) {
    const postIds = rows.map((post) => post.id);
    const repostedRows = await PostShare.findAll({
      where: { postId: { [Op.in]: postIds }, userId: viewerId, kind: 'repost' },
      attributes: ['postId'],
    });
    repostedSet = new Set(repostedRows.map((row) => row.postId));
  }

  // Batch lookup for viewerIsFollowingAuthor
  let followingSet = new Set();
  if (viewerId && rows.length) {
    const authorIds = rows.map((post) => post.userId);
    const followingRows = await Follow.findAll({
      where: { followerId: viewerId, followingId: { [Op.in]: authorIds } },
      attributes: ['followingId'],
    });
    followingSet = new Set(followingRows.map((row) => row.followingId));
  }

  const items = rows.map((post) => {
    const reposter = reposters.get(post.id);
    return toJSON(post, {
      viewerLiked: likedSet.has(post.id),
      viewerReposted: Boolean(reposter) || repostedSet.has(post.id),
      viewerIsFollowingAuthor: followingSet.has(post.userId),
      repostedBy: reposter ? reposter.toPublicJSON() : null,
    });
  });
  return { items, pageInfo: { hasMore: false, nextCursor: null } };
}

function toJSON(post, { viewerLiked, viewerIsFollowingAuthor = false, viewerReposted = false, repostedBy = null }) {
  return {
    id: post.id,
    content: post.content,
    media: withPosters(post.media ?? []),
    likeCount: post.likeCount,
    commentCount: post.commentCount,
    shareCount: post.shareCount,
    repostCount: post.repostCount ?? 0,
    viewerLiked,
    viewerReposted,
    // Set on a post shown in someone else's reposts tab so the card can say
    // "reposted by X" without the client having to know who is looking.
    repostedBy,
    editedAt: post.editedAt ? post.editedAt.toISOString() : null,
    mediaEditableUntil: new Date(post.createdAt.getTime() + MEDIA_EDIT_WINDOW_MS).toISOString(),
    createdAt: post.createdAt.toISOString(),
    user: post.user
      ? { ...post.user.toPublicJSON(), viewerIsFollowing: Boolean(viewerIsFollowingAuthor) }
      : null,
  };
}

module.exports = {
  create,
  update,
  feed,
  getPost,
  like,
  unlike,
  likeComment,
  unlikeComment,
  listComments,
  addComment,
  share,
  repost,
  unrepost,
  remove,
  userPosts,
  canEditMedia,
};