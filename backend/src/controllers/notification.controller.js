'use strict';

const asyncHandler = require('../utils/asyncHandler');
const notificationService = require('../services/notification.service');

const list = asyncHandler(async (req, res) => {
  const page = await notificationService.list(req.user.id, {
    ...req.validatedQuery,
    unreadOnly: req.validatedQuery?.unreadOnly === 'true',
  });
  res.json(page);
});

const unreadCount = asyncHandler(async (req, res) => {
  const count = await notificationService.unreadCount(req.user.id);
  res.json({ unreadCount: count });
});

/** Marks the supplied ids read, or the rider's whole inbox when none are given. */
const markRead = asyncHandler(async (req, res) => {
  const updated = await notificationService.markRead(req.user.id, req.body?.ids);
  res.json({ updated });
});

module.exports = { list, unreadCount, markRead };
