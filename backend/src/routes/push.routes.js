'use strict';

/**
 * Web Push subscriptions (RFC 8030, VAPID-signed).
 *
 * The browser stores a PushManager subscription and hands us the public half —
 * endpoint + p256dh + auth — keyed by a client-generated `deviceId` so a sign-out
 * can revoke a single device. The whole surface returns 404 while VAPID keys are
 * not configured, so a dev box without keys behaves like a plain missing route.
 */

const express = require('express');
const { z } = require('zod');

const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimit');
const pushController = require('../controllers/push.controller');

const router = express.Router();

router.use(requireAuth);

const subscribeBody = z
  .object({
    endpoint: z.string().trim().url('Endpoint must be a valid URL').max(500),
    p256dh: z.string().trim().min(1).max(500),
    auth: z.string().trim().min(1).max(500),
    deviceId: z.string().trim().min(1).max(255),
  })
  .strict();

const unsubscribeBody = z
  .object({ deviceId: z.string().trim().min(1).max(255) })
  .strict();

router.post('/subscribe', writeLimiter, validate({ body: subscribeBody }), pushController.subscribe);
router.delete('/subscribe', writeLimiter, validate({ body: unsubscribeBody }), pushController.unsubscribe);

module.exports = router;