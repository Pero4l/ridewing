'use strict';

/** Profile reads and updates. */

const { Op } = require('sequelize');

const { User, Follow, Post } = require('../models');
const ApiError = require('../utils/ApiError');
const { normalizeLimit } = require('../utils/pagination');

/** Fields a rider is allowed to change about themselves. Nothing else is accepted. */
const UPDATABLE_FIELDS = ['bio', 'profileImage', 'bikeInfo'];

const USERNAME_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

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

  const [followerCount, followingCount, viewerFollows, followsViewer, postCount] = await Promise.all([
    Follow.count({ where: { followingId: user.id } }),
    Follow.count({ where: { followerId: user.id } }),
    viewerId ? Follow.count({ where: { followerId: viewerId, followingId: user.id } }) : 0,
    viewerId ? Follow.count({ where: { followerId: user.id, followingId: viewerId } }) : 0,
    Post.count({ where: { userId: user.id } }),
  ]);

  const isSelf = viewerId === user.id;

  return {
    ...(isSelf ? user.toPrivateJSON() : user.toPublicJSON()),
    followerCount,
    followingCount,
    postCount,
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

  // Handle username change with 7-day cooldown
  if (payload.username !== undefined) {
    const newUsername = String(payload.username).trim().toLowerCase();
    if (newUsername !== user.username) {
      const now = new Date();
      const lastChanged = user.usernameChangedAt ? new Date(user.usernameChangedAt) : null;
      if (lastChanged && now.getTime() - lastChanged.getTime() < USERNAME_COOLDOWN_MS) {
        const nextChange = new Date(lastChanged.getTime() + USERNAME_COOLDOWN_MS);
        throw ApiError.badRequest(`You can change your username again on ${nextChange.toLocaleDateString()}.`);
      }
      // Check uniqueness
      const existing = await User.findOne({ where: { username: newUsername } });
      if (existing) throw ApiError.badRequest('That username is already taken');
      patch.username = newUsername;
      patch.usernameChangedAt = now;
    }
  }

  if (Object.keys(patch).length === 0) throw ApiError.badRequest('No changes supplied');

  await user.update(patch);
  return user;
}

/**
 * Rider search by username or display name.
 *
 * Username uses prefix matching (index-friendly). Display name uses contains
 * matching for better discoverability since users often search by real name.
 */
async function search(term, { limit } = {}) {
  const query = String(term || '').trim();
  if (query.length < 2) return [];

  const escaped = query.replace(/[%_\\]/g, '\\$&');
  const usernamePattern = `${escaped}%`;
  const displayNamePattern = `%${escaped}%`;

  return User.findAll({
    where: {
      [Op.or]: [
        { username: { [Op.iLike]: usernamePattern } },
        { displayName: { [Op.iLike]: displayNamePattern } },
      ],
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