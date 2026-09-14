'use strict';

const { z } = require('zod');
const { uuid } = require('./common.validator');
const env = require('../config/env');

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
  })
  .strict();

const rideParam = z.object({ rideId: uuid }).strict();

/** Join by ride id in the path, or by invite code in the body. */
const joinByCode = z
  .object({ code: z.string().trim().toUpperCase().min(4).max(12) })
  .strict();

const setVoiceMode = z.object({ voiceMode: z.enum(['ptt', 'open']) }).strict();

module.exports = { create, rideParam, joinByCode, setVoiceMode };
