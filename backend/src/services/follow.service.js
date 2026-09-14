'use strict';

/** Follow / unfollow and the follower listings. */

const { Op } = require('sequelize');

const { User, Follow } = require('../models');
const ApiError = require('../utils/ApiError');
const { normalizeLimit, decodeCursor, buildPage } = require('../utils/pagination');
const notificationService = require('./notification.service');

async function follow(followerId, targetUsername) {
  const target = await User.findOne({ where: { username: String(targetUsername).toLowerCase() } });
  if (!target) throw ApiError.notFound('Rider not found');
  if (target.id === followerId) throw ApiError.badRequest('You cannot follow yourself');

  // `findOrCreate` leans on the composite unique index, so a double-tap on a slow
  // connection is a no-op rather than an error.
  const [, created] = await Follow.findOrCreate({
    where: { followerId, followingId: target.id },
    defaults: { followerId, followingId: target.id },
  });

  if (created) {
    await notificationService.create({
      userId: target.id,
      actorId: followerId,
      type: 'follow',
      entityType: 'user',
      entityId: followerId,
    });
  }

  return { following: true, created, target };
}

async function unfollow(followerId, targetUsername) {
  const target = await User.findOne({ where: { username: String(targetUsername).toLowerCase() } });
  if (!target) throw ApiError.notFound('Rider not found');

  const removed = await Follow.destroy({ where: { followerId, followingId: target.id } });
  return { following: false, removed: removed > 0 };
}

/**
 * Keyset pagination over a follow list.
 *
 * @param {'followers'|'following'} direction
 */
async function list(userId, direction, { limit, cursor } = {}) {
  const pageSize = normalizeLimit(limit);
  const decoded = decodeCursor(cursor);

  const matchColumn = direction === 'followers' ? 'followingId' : 'followerId';
  const joinAlias = direction === 'followers' ? 'follower' : 'following';

  const where = { [matchColumn]: userId };
  if (decoded?.createdAt) {
    where.createdAt = { [Op.lt]: new Date(decoded.createdAt) };
  }

  const rows = await Follow.findAll({
    where,
    include: [{ model: User, as: joinAlias, required: true }],
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    limit: pageSize + 1, // one extra row reveals whether another page exists
  });

  const page = buildPage(rows, pageSize, (row) => ({ createdAt: row.createdAt.toISOString() }));

  return {
    items: page.items.map((row) => ({
      ...row[joinAlias].toPublicJSON(),
      followedAt: row.createdAt,
    })),
    pageInfo: page.pageInfo,
  };
}

/**
 * Bulk relationship lookup used by list screens, so rendering N riders costs one
 * query instead of N.
 */
async function followingIdsAmong(followerId, candidateIds) {
  if (!candidateIds.length) return new Set();
  const rows = await Follow.findAll({
    where: { followerId, followingId: { [Op.in]: candidateIds } },
    attributes: ['followingId'],
  });
  return new Set(rows.map((row) => row.followingId));
}

module.exports = { follow, unfollow, list, followingIdsAmong };
