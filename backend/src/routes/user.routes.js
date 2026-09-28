'use strict';

const express = require('express');

const validate = require('../middleware/validate');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimit');
const userController = require('../controllers/user.controller');
const userValidator = require('../validators/user.validator');

const router = express.Router();

/**
 * Public profile browsing: the profile, their posts and their follower lists are
 * readable without a session, because they are the pages people share links to.
 * Everything that changes state — following, and the profile itself — still sits
 * behind `requireAuth` below.
 */
router.get(
  '/:username',
  optionalAuth,
  validate({ params: userValidator.usernameParam }),
  userController.getProfile,
);

router.get(
  '/:username/posts',
  optionalAuth,
  validate({ params: userValidator.usernameParam, query: userValidator.listQuery }),
  userController.listPosts,
);

router.get(
  '/:username/followers',
  optionalAuth,
  validate({ params: userValidator.usernameParam, query: userValidator.listQuery }),
  userController.listFollowers,
);

router.get(
  '/:username/following',
  optionalAuth,
  validate({ params: userValidator.usernameParam, query: userValidator.listQuery }),
  userController.listFollowing,
);

router.use(requireAuth);

router.get('/search', validate({ query: userValidator.searchQuery }), userController.search);

router.patch(
  '/me',
  writeLimiter,
  validate({ body: userValidator.updateProfile }),
  userController.updateProfile,
);

router.post(
  '/:username/follow',
  writeLimiter,
  validate({ params: userValidator.usernameParam }),
  userController.follow,
);

router.delete(
  '/:username/follow',
  writeLimiter,
  validate({ params: userValidator.usernameParam }),
  userController.unfollow,
);

module.exports = router;
