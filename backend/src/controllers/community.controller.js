'use strict';

const asyncHandler = require('../utils/asyncHandler');
const communityService = require('../services/community.service');
const conversationService = require('../services/conversation.service');

const create = asyncHandler(async (req, res) => {
  const community = await communityService.create(req.user.id, req.body);
  res.status(201).json({ community: community.toJSONFor({ role: 'owner', status: 'active' }) });
});

const list = asyncHandler(async (req, res) => {
  const page = await communityService.list(req.validatedQuery);
  res.json(page);
});

const listMine = asyncHandler(async (req, res) => {
  const communities = await communityService.listMine(req.user.id);
  res.json({ communities });
});

const getDetail = asyncHandler(async (req, res) => {
  const community = await communityService.getDetail(req.params.slug, req.user?.id);
  res.json({ community });
});

const update = asyncHandler(async (req, res) => {
  const existing = await communityService.getBySlugOrThrow(req.params.slug);
  const community = await communityService.update(existing.id, req.user.id, req.body);
  const context = await communityService.viewerContext(community.id, req.user.id);
  res.json({ community: community.toJSONFor(context) });
});

const join = asyncHandler(async (req, res) => {
  const result = await communityService.join(req.params.slug, req.user.id, req.body?.message);
  res.status(result.state === 'requested' ? 202 : 200).json(result);
});

const leave = asyncHandler(async (req, res) => {
  const result = await communityService.leave(req.params.slug, req.user.id);
  res.json(result);
});

const listJoinRequests = asyncHandler(async (req, res) => {
  const requests = await communityService.listJoinRequests(req.params.slug, req.user.id, {
    status: req.validatedQuery?.status || 'pending',
  });
  res.json({ requests });
});

const reviewJoinRequest = asyncHandler(async (req, res) => {
  const result = await communityService.reviewJoinRequest(
    req.params.slug,
    req.user.id,
    req.params.requestId,
    req.body.decision,
  );
  res.json(result);
});

const cancelJoinRequest = asyncHandler(async (req, res) => {
  const result = await communityService.cancelJoinRequest(req.params.slug, req.user.id);
  res.json(result);
});

const listMembers = asyncHandler(async (req, res) => {
  const page = await communityService.listMembers(req.params.slug, req.user.id, req.validatedQuery);
  res.json(page);
});

const setMemberRole = asyncHandler(async (req, res) => {
  const result = await communityService.setMemberRole(
    req.params.slug,
    req.user.id,
    req.params.username,
    req.body.role,
  );
  res.json(result);
});

const removeMember = asyncHandler(async (req, res) => {
  const result = await communityService.removeMember(
    req.params.slug,
    req.user.id,
    req.params.username,
    { ban: req.validatedQuery?.ban === 'true' },
  );
  res.json(result);
});

const transferOwnership = asyncHandler(async (req, res) => {
  const result = await communityService.transferOwnership(
    req.params.slug,
    req.user.id,
    req.params.username,
  );
  res.json(result);
});

const followCommunity = asyncHandler(async (req, res) => {
  const result = await communityService.setFollowing(req.params.slug, req.user.id, true);
  res.json(result);
});

const unfollowCommunity = asyncHandler(async (req, res) => {
  const result = await communityService.setFollowing(req.params.slug, req.user.id, false);
  res.json(result);
});

/** Resolves the community's chat thread, membership-checked. */
const getConversation = asyncHandler(async (req, res) => {
  const community = await communityService.getBySlugOrThrow(req.params.slug);
  await communityService.requireActiveMember(community.id, req.user.id);
  const conversation = await conversationService.getCommunityConversation(community.id);
  res.json({ conversationId: conversation.id, type: conversation.type });
});

module.exports = {
  create,
  list,
  listMine,
  getDetail,
  update,
  join,
  leave,
  listJoinRequests,
  reviewJoinRequest,
  cancelJoinRequest,
  listMembers,
  setMemberRole,
  removeMember,
  transferOwnership,
  followCommunity,
  unfollowCommunity,
  getConversation,
};
