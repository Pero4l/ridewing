'use strict';

const express = require('express');
const { z } = require('zod');

const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const notificationController = require('../controllers/notification.controller');
const { pagination } = require('../validators/common.validator');

const router = express.Router();

router.use(requireAuth);

const listQuery = pagination.merge(
  z.object({ unreadOnly: z.enum(['true', 'false']).optional() }),
).strict();

const markReadBody = z
  .object({ ids: z.array(z.string().uuid()).max(200).optional() })
  .strict();

router.get('/', validate({ query: listQuery }), notificationController.list);
router.get('/unread-count', notificationController.unreadCount);
router.post('/read', validate({ body: markReadBody }), notificationController.markRead);

module.exports = router;
