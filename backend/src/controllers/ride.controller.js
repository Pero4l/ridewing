'use strict';

const asyncHandler = require('../utils/asyncHandler');
const rideService = require('../services/ride.service');
const turnService = require('../services/turn.service');
const { emitToRide, emitToUser } = require('../sockets/emit');

const create = asyncHandler(async (req, res) => {
  const ride = await rideService.create(req.user.id, req.body);
  res.status(201).json({ ride: ride.toJSONSafe() });
});

const listJoinable = asyncHandler(async (req, res) => {
  const rides = await rideService.listJoinable(req.user.id);
  res.json({ rides });
});

const getRide = asyncHandler(async (req, res) => {
  const { ride, relation } = await rideService.getForViewer(req.params.rideId, req.user.id);
  res.json({ ride: ride.toJSONSafe(), relation });
});

const join = asyncHandler(async (req, res) => {
  const { ride, rejoined } = await rideService.join({ rideId: req.params.rideId }, req.user.id);
  res.json({ ride: ride.toJSONSafe(), rejoined });
});

const joinByCode = asyncHandler(async (req, res) => {
  const { ride, rejoined } = await rideService.join({ code: req.body.code }, req.user.id);
  res.json({ ride: ride.toJSONSafe(), rejoined });
});

const leave = asyncHandler(async (req, res) => {
  const result = await rideService.leave(req.params.rideId, req.user.id);
  if (result.left) {
    emitToRide(req.params.rideId, 'ride:participant-left', { userId: req.user.id });
  }
  res.json(result);
});

const end = asyncHandler(async (req, res) => {
  const result = await rideService.end(req.params.rideId, req.user.id);
  emitToRide(req.params.rideId, 'ride:ended', result);
  res.json(result);
});

const setVoiceMode = asyncHandler(async (req, res) => {
  const result = await rideService.setVoiceMode(
    req.params.rideId,
    req.user.id,
    req.body.voiceMode,
  );
  emitToRide(req.params.rideId, 'ride:voice-mode', result);
  res.json(result);
});

const setSignal = asyncHandler(async (req, res) => {
  const result = await rideService.setSignal(
    req.params.rideId,
    req.user.id,
    req.body.kind,
    req.body.active,
  );

  // Everyone on the ride hears and sees it — whether or not they are seated in
  // the voice room right now.
  const participantIds = await rideService.activeParticipantIds(req.params.rideId);
  const payload = {
    rideId: req.params.rideId,
    userId: req.user.id,
    kind: result.kind,
    active: result.active,
  };
  emitToRide(req.params.rideId, 'ride:signal', payload);
  participantIds.forEach((participantId) => emitToUser(participantId, 'ride:signal', payload));

  res.json(result);
});

/**
 * ICE server configuration for the browser.
 *
 * Served from an authenticated endpoint rather than a public build-time variable,
 * so TURN credentials never sit in the frontend bundle. Cloudflare TURN keys are
 * minted server-side when configured.
 */
const iceServers = asyncHandler(async (req, res) => {
  res.json({ iceServers: await turnService.getIceServers() });
});

module.exports = {
  create,
  listJoinable,
  getRide,
  join,
  joinByCode,
  leave,
  end,
  setVoiceMode,
  setSignal,
  iceServers,
};
