'use strict';

const { z } = require('zod');
const { uuid } = require('./common.validator');
const env = require('../config/env');
const { RIDE_POSITIONS } = require('../utils/ridePositions');

const boundaryMeters = z.coerce.number().int().min(100).max(5000);

const create = z
  .object({
    name: z.string().trim().min(3, 'Ride name must be at least 3 characters').max(80),
    voiceMode: z.enum(['ptt', 'open']).optional(),
    maxParticipants: z.coerce
      .number()
      .int()
      .min(2)
      .max(env.limits.maxRideParticipants)
      .optional(),
    forwardBoundaryM: boundaryMeters.optional(),
    rearBoundaryM: boundaryMeters.optional(),
  })
  .strict();

const rideParam = z.object({ rideId: uuid }).strict();

/** Join by ride id in the path, or by invite code in the body. */
const joinByCode = z
  .object({ code: z.string().trim().toUpperCase().min(4).max(12) })
  .strict();

const setVoiceMode = z.object({ voiceMode: z.enum(['ptt', 'open']) }).strict();

const setSignal = z
  .object({
    kind: z.enum(['help', 'stop']),
    active: z.boolean(),
  })
  .strict();

const assignPosition = z
  .object({
    userId: uuid,
    position: z.enum(RIDE_POSITIONS),
    // Only meaningful when transferring LEAD_RIDER; defaults to FORMATION_RIDER.
    replacementPosition: z.enum(RIDE_POSITIONS).optional(),
  })
  .strict();

const setBoundarySettings = z
  .object({
    forwardBoundaryM: boundaryMeters,
    rearBoundaryM: boundaryMeters,
  })
  .strict();

const reportLocation = z
  .object({
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    accuracy: z.number().finite().min(0).max(5000).nullable().optional(),
    heading: z.number().finite().min(0).max(360).nullable().optional(),
    // 0..1 along a planned route, supplied only when the client has geometry.
    routeProgress: z.number().finite().min(0).max(1).nullable().optional(),
    timestamp: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

module.exports = {
  create,
  rideParam,
  joinByCode,
  setVoiceMode,
  setSignal,
  assignPosition,
  setBoundarySettings,
  reportLocation,
};
