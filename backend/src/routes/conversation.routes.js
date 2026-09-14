'use strict';

const express = require('express');

const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { messageLimiter, writeLimiter } = require('../middleware/rateLimit');
const conversationController = require('../controllers/conversation.controller');
const v = require('../validators/message.validator');

const router = express.Router();

router.use(requireAuth);

router.get('/', conversationController.listConversations);

// Opens (or finds) a direct thread with another rider.
router.post(
  '/direct',
  writeLimiter,
  validate({ body: v.openDirect }),
  conversationController.openDirect,
);

router.get(
  '/:conversationId/messages',
  validate({ params: v.conversationParam, query: v.historyQuery }),
  conversationController.history,
);

// Fallback send path for when the socket is unavailable.
router.post(
  '/:conversationId/messages',
  messageLimiter,
  validate({ params: v.conversationParam, body: v.sendMessage }),
  conversationController.sendMessage,
);

router.post(
  '/:conversationId/read',
  validate({ params: v.conversationParam }),
  conversationController.markRead,
);

module.exports = router;
