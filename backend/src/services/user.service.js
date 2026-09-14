'use strict';

/** Profile reads and updates. */

const { Op } = require('sequelize');

const { User, Follow } = require('../models');
const ApiError = require('../utils/ApiError');
const { normalizeLimit } = require('../utils/pagination');

/** Fields a rider is allowed to change about themselves. Nothing else is accepted. */
const UPDATABLE_FIELDS = ['displayName', 'bio', 'profileImage', 'bikeInfo'];

async function getByUsername(username) {
  const user = await User.findOne({ where: { username: String(username).toLowerCase() } });
  if (!user) throw ApiError.notFound('Rider not found');
  return user;
}

async function getById(id) {
  const user = await User.findByPk(id);
  if (!user) throw ApiError.notFound('Rider not found');
  return user;
}

/**
 * Builds the profile payload, including follow counts and the viewer's
 * relationship to this rider.
 */
async function getProfile(username, viewerId) {
  const user = await getByUsername(username);

  const [followerCount, followingCount, viewerFollows, followsViewer] = await Promise.all([
    Follow.count({ where: { followingId: user.id } }),
    Follow.count({ where: { followerId: user.id } }),
    viewerId ? Follow.count({ where: { followerId: viewerId, followingId: user.id } }) : 0,
    viewerId ? Follow.count({ where: { followerId: user.id, followingId: viewerId } }) : 0,
  ]);

  const isSelf = viewerId === user.id;

  return {
    ...(isSelf ? user.toPrivateJSON() : user.toPublicJSON()),
    followerCount,
    followingCount,
    isSelf,
    viewerIsFollowing: viewerFollows > 0,
    followsViewer: followsViewer > 0,
  };
}

async function updateProfile(userId, payload) {
  const user = await getById(userId);

  const patch = {};
  UPDATABLE_FIELDS.forEach((field) => {
    if (payload[field] !== undefined) patch[field] = payload[field];
  });

  if (Object.keys(patch).length === 0) throw ApiError.badRequest('No changes supplied');

  await user.update(patch);
  return user;
}

/**
 * Rider search by username or display name.
 *
 * `iLike` with a trailing wildcard keeps the query index-friendly; a leading
 * wildcard would force a full scan.
 */
async function search(term, { limit } = {}) {
  const query = String(term || '').trim();
  if (query.length < 2) return [];

  const pattern = `${query.replace(/[%_\\]/g, '\\$&')}%`;

  return User.findAll({
    where: {
      [Op.or]: [{ username: { [Op.iLike]: pattern } }, { displayName: { [Op.iLike]: pattern } }],
    },
    order: [['username', 'ASC']],
    limit: normalizeLimit(limit, 20),
  });
}

/** Records activity for presence display. Fire-and-forget; never blocks a request. */
async function touchLastSeen(userId) {
  await User.update({ lastSeenAt: new Date() }, { where: { id: userId } });
}

module.exports = {
  getById,
  getByUsername,
  getProfile,
  updateProfile,
  search,
  touchLastSeen,
  UPDATABLE_FIELDS,
};
