'use strict';

const express = require('express');

const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimit');
const userController = require('../controllers/user.controller');
const userValidator = require('../validators/user.validator');

const router = express.Router();

// Every profile route requires a session — RideWing has no public browsing in V1.
router.use(requireAuth);

router.get('/search', validate({ query: userValidator.searchQuery }), userController.search);

router.patch(
  '/me',
  writeLimiter,
  validate({ body: userValidator.updateProfile }),
  userController.updateProfile,
);

router.get(
  '/:username',
  validate({ params: userValidator.usernameParam }),
  userController.getProfile,
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

router.get(
  '/:username/followers',
  validate({ params: userValidator.usernameParam, query: userValidator.listQuery }),
  userController.listFollowers,
);

router.get(
  '/:username/following',
  validate({ params: userValidator.usernameParam, query: userValidator.listQuery }),
  userController.listFollowing,
);

router.get(
  '/:username/posts',
  validate({ params: userValidator.usernameParam, query: userValidator.listQuery }),
  userController.listPosts,
);

module.exports = router;
