'use strict';

const express = require('express');

const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimit');
const communityController = require('../controllers/community.controller');
const v = require('../validators/community.validator');

const router = express.Router();

router.use(requireAuth);

router.get('/', validate({ query: v.listQuery }), communityController.list);
router.get('/mine', communityController.listMine);
router.post('/', writeLimiter, validate({ body: v.create }), communityController.create);

router.get('/:slug', validate({ params: v.slugParam }), communityController.getDetail);
router.patch(
  '/:slug',
  writeLimiter,
  validate({ params: v.slugParam, body: v.update }),
  communityController.update,
);

// Membership
router.post(
  '/:slug/join',
  writeLimiter,
  validate({ params: v.slugParam, body: v.join }),
  communityController.join,
);
router.post(
  '/:slug/leave',
  writeLimiter,
  validate({ params: v.slugParam }),
  communityController.leave,
);
router.get(
  '/:slug/members',
  validate({ params: v.slugParam, query: v.listQuery }),
  communityController.listMembers,
);

// Join request moderation
router.get(
  '/:slug/requests',
  validate({ params: v.slugParam, query: v.requestsQuery }),
  communityController.listJoinRequests,
);
router.post(
  '/:slug/requests/:requestId/review',
  writeLimiter,
  validate({ params: v.requestParams, body: v.reviewRequest }),
  communityController.reviewJoinRequest,
);
router.delete(
  '/:slug/requests/mine',
  writeLimiter,
  validate({ params: v.slugParam }),
  communityController.cancelJoinRequest,
);

// Role and member administration
router.put(
  '/:slug/members/:username/role',
  writeLimiter,
  validate({ params: v.memberParams, body: v.setRole }),
  communityController.setMemberRole,
);
router.delete(
  '/:slug/members/:username',
  writeLimiter,
  validate({ params: v.memberParams, query: v.removeMemberQuery }),
  communityController.removeMember,
);
router.post(
  '/:slug/transfer-ownership/:username',
  writeLimiter,
  validate({ params: v.memberParams }),
  communityController.transferOwnership,
);

// Following (no chat access)
router.post(
  '/:slug/follow',
  writeLimiter,
  validate({ params: v.slugParam }),
  communityController.followCommunity,
);
router.delete(
  '/:slug/follow',
  writeLimiter,
  validate({ params: v.slugParam }),
  communityController.unfollowCommunity,
);

// Resolves the community's chat thread for the client.
router.get(
  '/:slug/conversation',
  validate({ params: v.slugParam }),
  communityController.getConversation,
);

module.exports = router;
