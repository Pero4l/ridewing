'use strict';

/**
 * Message-scoped routes.
 *
 * Kept separate from the conversation router so `/messages/:messageId` cannot be
 * confused with `/:conversationId/messages` as more verbs are added.
 */

const express = require('express');

const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimit');
const conversationController = require('../controllers/conversation.controller');
const v = require('../validators/message.validator');

const router = express.Router();

router.use(requireAuth);

router.delete(
  '/:messageId',
  writeLimiter,
  validate({ params: v.messageParam }),
  conversationController.deleteMessage,
);

module.exports = router;
