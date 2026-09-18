'use strict';

const asyncHandler = require('../utils/asyncHandler');
const userService = require('../services/user.service');
const followService = require('../services/follow.service');
const postService = require('../services/post.service');

const getProfile = asyncHandler(async (req, res) => {
  const profile = await userService.getProfile(req.params.username, req.user?.id);
  res.json({ user: profile });
});

const updateProfile = asyncHandler(async (req, res) => {
  const user = await userService.updateProfile(req.user.id, req.body);
  res.json({ user: user.toPrivateJSON() });
});

const search = asyncHandler(async (req, res) => {
  const { q, limit } = req.validatedQuery;
  const users = await userService.search(q, { limit });

  // One extra query resolves "do I follow them" for the whole result set.
  const followingIds = req.user
    ? await followService.followingIdsAmong(req.user.id, users.map((user) => user.id))
    : new Set();

  res.json({
    users: users.map((user) => ({
      ...user.toPublicJSON(),
      viewerIsFollowing: followingIds.has(user.id),
    })),
  });
});

const follow = asyncHandler(async (req, res) => {
  const result = await followService.follow(req.user.id, req.params.username);
  res.status(result.created ? 201 : 200).json({ following: true });
});

const unfollow = asyncHandler(async (req, res) => {
  await followService.unfollow(req.user.id, req.params.username);
  res.json({ following: false });
});

const listFollowers = asyncHandler(async (req, res) => {
  const user = await userService.getByUsername(req.params.username);
  const page = await followService.list(user.id, 'followers', req.validatedQuery);
  res.json(page);
});

const listFollowing = asyncHandler(async (req, res) => {
  const user = await userService.getByUsername(req.params.username);
  const page = await followService.list(user.id, 'following', req.validatedQuery);
  res.json(page);
});

const listPosts = asyncHandler(async (req, res) => {
  const page = await postService.userPosts(req.params.username, req.validatedQuery);
  res.json(page);
});

module.exports = {
  getProfile,
  updateProfile,
  search,
  follow,
  unfollow,
  listFollowers,
  listFollowing,
  listPosts,
};
