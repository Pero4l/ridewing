'use strict';

const asyncHandler = require('../utils/asyncHandler');
const pushService = require('../services/push.service');

const subscribe = asyncHandler(async (req, res) => {
  const subscription = await pushService.subscribe(req.user.id, {
    ...req.body,
    userAgent: req.headers['user-agent'],
  });
  res.status(201).json({ subscription: { id: subscription.id, deviceId: subscription.deviceId } });
});

const unsubscribe = asyncHandler(async (req, res) => {
  await pushService.unsubscribe(req.user.id, { deviceId: req.body?.deviceId });
  res.status(204).end();
});

module.exports = { subscribe, unsubscribe };