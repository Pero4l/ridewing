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

// Creator-only group formation controls.
router.put(
  '/:rideId/positions',
  writeLimiter,
  validate({ params: v.rideParam, body: v.assignPosition }),
  rideController.assignPosition,
);
router.put(
  '/:rideId/boundary-settings',
  writeLimiter,
  validate({ params: v.rideParam, body: v.setBoundarySettings }),
  rideController.setBoundarySettings,
);

// Live location is the caller's own location, resolved from the authenticated
// token — the body never carries a userId.
router.put(
  '/:rideId/location',
  writeLimiter,
  validate({ params: v.rideParam, body: v.reportLocation }),
  rideController.reportLocation,
);
router.delete(
  '/:rideId/location',
  writeLimiter,
  validate({ params: v.rideParam }),
  rideController.stopLocationSharing,
);

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
