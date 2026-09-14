'use strict';

const express = require('express');

const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimit');
const postController = require('../controllers/post.controller');
const postValidator = require('../validators/post.validator');

const router = express.Router();

router.use(requireAuth);

router.get('/', validate({ query: postValidator.feedParams }), postController.listFeed);

router.post('/', writeLimiter, validate({ body: postValidator.create }), postController.create);

router.get('/:id', validate({ params: postValidator.idParams }), postController.getDetail);

router.patch('/:id', writeLimiter, validate({ params: postValidator.idParams, body: postValidator.edit }), postController.update);

router.post('/:id/like', writeLimiter, validate({ params: postValidator.idParams }), postController.like);
router.delete('/:id/like', validate({ params: postValidator.idParams }), postController.unlike);

router.get('/:id/comments', validate({ params: postValidator.idParams, query: postValidator.feedParams }), postController.listComments);
router.post('/:id/comments', writeLimiter, validate({ params: postValidator.idParams, body: postValidator.comment }), postController.addComment);

router.post('/:id/share', writeLimiter, validate({ params: postValidator.idParams }), postController.share);

router.delete('/:id', validate({ params: postValidator.idParams }), postController.remove);

module.exports = router;