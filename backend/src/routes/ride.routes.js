'use strict';

const express = require('express');

const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimit');
const rideController = require('../controllers/ride.controller');
const v = require('../validators/ride.validator');

const router = express.Router();

router.use(requireAuth);

// TURN/STUN configuration, kept out of the public frontend bundle.
router.get('/ice-servers', rideController.iceServers);

router.get('/', rideController.listJoinable);
router.post('/', writeLimiter, validate({ body: v.create }), rideController.create);

// Join by short invite code.
router.post('/join', writeLimiter, validate({ body: v.joinByCode }), rideController.joinByCode);

router.get('/:rideId', validate({ params: v.rideParam }), rideController.getRide);
router.post(
  '/:rideId/join',
  writeLimiter,
  validate({ params: v.rideParam }),
  rideController.join,
);
router.post(
  '/:rideId/leave',
  writeLimiter,
  validate({ params: v.rideParam }),
  rideController.leave,
);
router.post('/:rideId/end', writeLimiter, validate({ params: v.rideParam }), rideController.end);
router.put(
  '/:rideId/voice-mode',
  writeLimiter,
  validate({ params: v.rideParam, body: v.setVoiceMode }),
  rideController.setVoiceMode,
);
router.put(
  '/:rideId/signal',
  writeLimiter,
  validate({ params: v.rideParam, body: v.setSignal }),
  rideController.setSignal,
);

module.exports = router;
