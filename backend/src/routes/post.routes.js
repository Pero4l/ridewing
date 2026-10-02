'use strict';

const express = require('express');

const validate = require('../middleware/validate');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimit');
const postController = require('../controllers/post.controller');
const postValidator = require('../validators/post.validator');

const router = express.Router();

/**
 * Reading is public.
 *
 * Only the two read endpoints are declared before `requireAuth`, so a
 * signed-out visitor can browse the feed and open a post — the routes after it
 * are every action a rider takes, and those all require an account. Keeping the
 * split this way round means new read endpoints are opt-in public rather than
 * opt-in private, which is the safer default for a social feed people expect to
 * be linkable.
 */
router.get('/', optionalAuth, validate({ query: postValidator.feedParams }), postController.listFeed);
router.get('/:id', optionalAuth, validate({ params: postValidator.idParams }), postController.getDetail);
router.get('/:id/comments', optionalAuth, validate({ params: postValidator.idParams, query: postValidator.feedParams }), postController.listComments);

router.use(requireAuth);

router.post('/', writeLimiter, validate({ body: postValidator.create }), postController.create);

router.patch('/:id', writeLimiter, validate({ params: postValidator.idParams, body: postValidator.edit }), postController.update);

router.post('/:id/like', writeLimiter, validate({ params: postValidator.idParams }), postController.like);
router.delete('/:id/like', validate({ params: postValidator.idParams }), postController.unlike);

router.post('/:id/comments', writeLimiter, validate({ params: postValidator.idParams, body: postValidator.comment }), postController.addComment);

router.post('/:id/comments/:commentId/like', writeLimiter, validate({ params: postValidator.idParams }), postController.likeComment);
router.delete('/:id/comments/:commentId/like', validate({ params: postValidator.idParams }), postController.unlikeComment);

router.post('/:id/share', writeLimiter, validate({ params: postValidator.idParams }), postController.share);
router.post('/:id/repost', writeLimiter, validate({ params: postValidator.idParams }), postController.repost);
router.delete('/:id/repost', validate({ params: postValidator.idParams }), postController.unrepost);

router.delete('/:id', validate({ params: postValidator.idParams }), postController.remove);

module.exports = router;