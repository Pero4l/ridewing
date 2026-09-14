'use strict';

/**
 * Ride sessions.
 *
 * V1 connects riders in a WebRTC mesh, so capacity is enforced strictly and
 * checked inside a locked transaction — two riders tapping "join" at once must not
 * both slip past the cap.
 */

const { Op } = require('sequelize');

const env = require('../config/env');
const { RideSession, RideParticipant, Follow, User, sequelize } = require('../models');
const ApiError = require('../utils/ApiError');
const { inviteCode } = require('../utils/slug');

const ACTIVE_INCLUDE = [
  { model: User, as: 'creator' },
  {
    model: RideParticipant,
    as: 'participants',
    where: { status: 'joined' },
    required: false,
    include: [{ model: User, as: 'user' }],
  },
];

async function allocateInviteCode(transaction) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = inviteCode();
    const clash = await RideSession.findOne({
      where: { inviteCode: code },
      attributes: ['id'],
      transaction,
    });
    if (!clash) return code;
  }
  throw ApiError.internal('Could not allocate a ride invite code');
}

/** Creates a ride and enrols the creator as its first participant. */
async function create(creatorId, { name, voiceMode = 'ptt', maxParticipants } = {}) {
  const cap = Math.min(
    Math.max(Number(maxParticipants) || env.limits.maxRideParticipants, 2),
    env.limits.maxRideParticipants,
  );

  const ride = await sequelize.transaction(async (transaction) => {
    const code = await allocateInviteCode(transaction);

    const created = await RideSession.create(
      { creatorId, name: String(name).trim(), voiceMode, inviteCode: code, maxParticipants: cap },
      { transaction },
    );

    await RideParticipant.create(
      { rideSessionId: created.id, userId: creatorId, status: 'joined' },
      { transaction },
    );

    return created;
  });

  return getById(ride.id);
}

async function getById(rideId) {
  const ride = await RideSession.findByPk(rideId, { include: ACTIVE_INCLUDE });
  if (!ride) throw ApiError.notFound('Ride not found');
  return ride;
}

async function getByInviteCode(code) {
  const ride = await RideSession.findOne({
    where: { inviteCode: String(code).toUpperCase() },
    include: ACTIVE_INCLUDE,
  });
  if (!ride) throw ApiError.notFound('Ride not found');
  return ride;
}

/** Boolean membership check for the socket layer. */
async function isActiveParticipant(rideId, userId) {
  const [ride, participant] = await Promise.all([
    RideSession.findByPk(rideId, { attributes: ['id', 'status'] }),
    RideParticipant.findOne({
      where: { rideSessionId: rideId, userId, status: 'joined' },
      attributes: ['id'],
    }),
  ]);
  return Boolean(ride && ride.status === 'active' && participant);
}

/**
 * Joins a ride by id or invite code.
 *
 * Rejoining after a signal drop reuses the existing row, so the ride roster does
 * not accumulate duplicates for one rider.
 */
async function join({ rideId, code }, userId) {
  const target = rideId ? await getById(rideId) : await getByInviteCode(code);

  const result = await sequelize.transaction(async (transaction) => {
    const ride = await RideSession.findByPk(target.id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!ride) throw ApiError.notFound('Ride not found');
    if (ride.status !== 'active') throw ApiError.conflict('That ride has already ended');

    const existing = await RideParticipant.findOne({
      where: { rideSessionId: ride.id, userId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (existing?.status === 'joined') return { rideId: ride.id, rejoined: false };

    // Capacity is counted under the ride's row lock, so the check is authoritative.
    const joinedCount = await RideParticipant.count({
      where: { rideSessionId: ride.id, status: 'joined' },
      transaction,
    });
    if (joinedCount >= ride.maxParticipants) {
      throw ApiError.conflict(
        `This ride is full (${ride.maxParticipants} riders maximum)`,
        { code: 'RIDE_FULL' },
      );
    }

    if (existing) {
      await existing.update(
        { status: 'joined', joinedAt: new Date(), leftAt: null },
        { transaction },
      );
      return { rideId: ride.id, rejoined: true };
    }

    await RideParticipant.create(
      { rideSessionId: ride.id, userId, status: 'joined' },
      { transaction },
    );
    return { rideId: ride.id, rejoined: false };
  });

  return { ride: await getById(result.rideId), rejoined: result.rejoined };
}

async function leave(rideId, userId) {
  const [updated] = await RideParticipant.update(
    { status: 'left', leftAt: new Date() },
    { where: { rideSessionId: rideId, userId, status: 'joined' } },
  );
  return { left: updated > 0 };
}

/** Ends a ride. Creator only; also marks every remaining rider as departed. */
async function end(rideId, actorId) {
  return sequelize.transaction(async (transaction) => {
    const ride = await RideSession.findByPk(rideId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!ride) throw ApiError.notFound('Ride not found');
    if (ride.creatorId !== actorId) throw ApiError.forbidden('Only the ride creator can end it');
    if (ride.status === 'ended') return { id: ride.id, status: 'ended' };

    const endedAt = new Date();
    await ride.update({ status: 'ended', endedAt }, { transaction });
    await RideParticipant.update(
      { status: 'left', leftAt: endedAt },
      { where: { rideSessionId: ride.id, status: 'joined' }, transaction },
    );

    return { id: ride.id, status: 'ended', endedAt };
  });
}

/** Switches between push-to-talk and open talk for everyone. Creator only. */
async function setVoiceMode(rideId, actorId, voiceMode) {
  if (!['ptt', 'open'].includes(voiceMode)) {
    throw ApiError.badRequest('Voice mode must be "ptt" or "open"');
  }

  const ride = await RideSession.findByPk(rideId);
  if (!ride) throw ApiError.notFound('Ride not found');
  if (ride.creatorId !== actorId) {
    throw ApiError.forbidden('Only the ride creator can change the voice mode');
  }
  if (ride.status !== 'active') throw ApiError.conflict('That ride has already ended');

  await ride.update({ voiceMode });
  return { id: ride.id, voiceMode };
}

/**
 * Rides the viewer can plausibly join: their own, plus active rides started by
 * riders they follow.
 */
async function listJoinable(userId) {
  const following = await Follow.findAll({
    where: { followerId: userId },
    attributes: ['followingId'],
  });
  const followingIds = following.map((row) => row.followingId);

  const rides = await RideSession.findAll({
    where: {
      status: 'active',
      [Op.or]: [
        { creatorId: userId },
        ...(followingIds.length ? [{ creatorId: { [Op.in]: followingIds } }] : []),
      ],
    },
    include: ACTIVE_INCLUDE,
    order: [['createdAt', 'DESC']],
    limit: 50,
  });

  // Rides the rider is already in, even if started by somebody they do not follow.
  const ownParticipations = await RideParticipant.findAll({
    where: { userId, status: 'joined' },
    attributes: ['rideSessionId'],
  });
  const seen = new Set(rides.map((ride) => ride.id));
  const missingIds = ownParticipations
    .map((row) => row.rideSessionId)
    .filter((id) => !seen.has(id));

  if (missingIds.length) {
    const extra = await RideSession.findAll({
      where: { id: { [Op.in]: missingIds }, status: 'active' },
      include: ACTIVE_INCLUDE,
    });
    rides.push(...extra);
  }

  return rides.map((ride) => ride.toJSONSafe());
}

/** Participant user ids currently in the ride — the signaling fan-out list. */
async function activeParticipantIds(rideId) {
  const rows = await RideParticipant.findAll({
    where: { rideSessionId: rideId, status: 'joined' },
    attributes: ['userId'],
  });
  return rows.map((row) => row.userId);
}

module.exports = {
  create,
  getById,
  getByInviteCode,
  isActiveParticipant,
  join,
  leave,
  end,
  setVoiceMode,
  listJoinable,
  activeParticipantIds,
};
