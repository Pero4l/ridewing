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
  PostShare,
  Follow,
  User,
} = require('../models');
const ApiError = require('../utils/ApiError');
const { normalizeLimit, decodeCursor, buildPage } = require('../utils/pagination');
const notificationService = require('./notification.service');

const MAX_MEDIA_ITEMS = 9;

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

  post.content = contentText;
  post.media = media;
  post.editedAt = new Date();
  await post.save();

  const liked = await PostLike.findOne({ where: { postId: post.id, userId }, attributes: ['id'] });
  return toJSON(post, { viewerLiked: Boolean(liked) });
}

async function getPost(postId, viewerId) {
  const post = await loadPostOrThrow(postId);
  const liked = await PostLike.findOne({ where: { postId: post.id, userId: viewerId }, attributes: ['id'] });
  return toJSON(post, { viewerLiked: Boolean(liked) });
}

async function feed(userId, { limit, cursor } = {}) {
  const pageSize = normalizeLimit(limit, 20);
  const decoded = decodeCursor(cursor);

  // Posts by people the rider follows plus their own.
  const followingRows = await Follow.findAll({
    where: { followerId: userId },
    attributes: ['followingId'],
  });
  const authorIds = new Set([userId, ...followingRows.map((row) => row.followingId)]);

  const where = { userId: { [Op.in]: [...authorIds] } };
  if (decoded?.createdAt) where.createdAt = { [Op.lt]: new Date(decoded.createdAt) };

  const rows = await Post.findAll({
    where,
    include: [{ model: User, as: 'user' }],
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    limit: pageSize + 1,
  });

  const page = buildPage(rows, pageSize, (row) => ({ createdAt: row.createdAt.toISOString() }));

  // One query for every "did I like this?" check on the page.
  const postIds = page.items.map((post) => post.id);
  const likedRows = postIds.length
    ? await PostLike.findAll({
        where: { postId: { [Op.in]: postIds }, userId },
        attributes: ['postId'],
      })
    : [];
  const likedSet = new Set(likedRows.map((row) => row.postId));

  return {
    items: page.items.map((post) => toJSON(post, { viewerLiked: likedSet.has(post.id) })),
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

async function listComments(postId, { limit, cursor } = {}) {
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

  const items = rows.map((row) => ({
    id: row.id,
    postId: row.postId,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
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

async function addComment(postId, userId, rawContent) {
  const content = String(rawContent ?? '').trim();
  if (!content) throw ApiError.badRequest('Comment cannot be empty');
  if (content.length > 1000) throw ApiError.badRequest('Comment cannot exceed 1000 characters');

  return sequelize.transaction(async (transaction) => {
    const post = await Post.findByPk(postId, { transaction });
    if (!post) throw ApiError.notFound('Post not found');

    const comment = await PostComment.create({ postId, userId, content }, { transaction });
    await Post.increment('commentCount', { by: 1, where: { id: postId }, transaction });

    transaction.afterCommit(() =>
      notificationService.create({
        userId: post.userId,
        actorId: userId,
        type: 'post_comment',
        entityType: 'post',
        entityId: postId,
        data: { postId, commentId: comment.id },
      }),
    );

    return { comment };
  });
}

/** "Share" records that this rider passed the post on (repost). */
async function share(postId, userId) {
  return sequelize.transaction(async (transaction) => {
    const post = await Post.findByPk(postId, { transaction });
    if (!post) throw ApiError.notFound('Post not found');

    await PostShare.findOrCreate({ where: { postId, userId }, defaults: { postId, userId }, transaction });
    await Post.increment('shareCount', { by: 1, where: { id: postId }, transaction });

    transaction.afterCommit(() =>
      notificationService.create({
        userId: post.userId,
        actorId: userId,
        type: 'post_share',
        entityType: 'post',
        entityId: postId,
        data: { postId },
      }),
    );
    return { shared: true };
  });
}

async function remove(postId, userId) {
  const post = await Post.findByPk(postId, { attributes: ['id', 'userId'] });
  if (!post) throw ApiError.notFound('Post not found');
  if (post.userId !== userId) throw ApiError.forbidden('You can only delete your own posts');
  await post.destroy();
  return { deleted: true };
}

function toJSON(post, { viewerLiked }) {
  return {
    id: post.id,
    content: post.content,
    media: post.media ?? [],
    likeCount: post.likeCount,
    commentCount: post.commentCount,
    shareCount: post.shareCount,
    viewerLiked,
    editedAt: post.editedAt ? post.editedAt.toISOString() : null,
    createdAt: post.createdAt.toISOString(),
    user: post.user ? post.user.toPublicJSON() : null,
  };
}

module.exports = { create, update, feed, getPost, like, unlike, listComments, addComment, share, remove };