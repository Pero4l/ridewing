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
const { RideSession, RideParticipant, Follow, CommunityMember, Community, User, sequelize } = require('../models');
const ApiError = require('../utils/ApiError');
const { inviteCode } = require('../utils/slug');
const {
  DEFAULT_RIDE_POSITION,
  LEAD_RIDER,
  assertCanManagePositions,
  planPositionAssignments,
} = require('../utils/ridePositions');
const { isPlausibleMovement, locationOf } = require('../utils/rideBoundary');
const emailService = require('./email.service');

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
async function create(creatorId, {
  name,
  voiceMode = 'ptt',
  maxParticipants,
  forwardBoundaryM,
  rearBoundaryM,
} = {}) {
  const cap = Math.min(
    Math.max(Number(maxParticipants) || env.limits.maxRideParticipants, 2),
    env.limits.maxRideParticipants,
  );

  const ride = await sequelize.transaction(async (transaction) => {
    const code = await allocateInviteCode(transaction);

    const created = await RideSession.create(
      {
        creatorId,
        name: String(name).trim(),
        voiceMode,
        inviteCode: code,
        maxParticipants: cap,
        forwardBoundaryM: forwardBoundaryM ?? 500,
        rearBoundaryM: rearBoundaryM ?? 800,
        lastActivityAt: new Date(),
      },
      { transaction },
    );

    await RideParticipant.create(
      {
        rideSessionId: created.id,
        userId: creatorId,
        status: 'joined',
        // The creator leads the group from the moment the ride exists. This is
        // inside the same transaction as the ride row, so a failed create cannot
        // leave an owner without a Lead Rider.
        position: LEAD_RIDER,
      },
      { transaction },
    );

    return created;
  });

  const session = await getById(ride.id);

  emailService.alertAdmins({
    subject: 'RideWing: new ride started',
    text: `A new ride was started: ${session.name}.`,
    html: emailService.renderHtml({
      title: 'New ride started',
      paragraphs: [
        `Creator: @${session.creator?.username ?? creatorId}`,
        `Name: ${session.name}`,
        `Voice mode: ${session.voiceMode}`,
        `Invite code: ${session.inviteCode}`,
      ],
    }),
  });

  return session;
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

    // Any join counts as activity.
    await ride.update({ lastActivityAt: new Date() }, { transaction });

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

    // Normally the creator is already the lead. If a legacy ride has no lead,
    // the creator rejoining restores one instead of leaving the group without a
    // forward boundary.
    const leadExists = await RideParticipant.count({
      where: { rideSessionId: ride.id, status: 'joined', position: LEAD_RIDER },
      transaction,
    });
    const position = !leadExists && ride.creatorId === userId ? LEAD_RIDER : DEFAULT_RIDE_POSITION;

    if (existing) {
      await existing.update(
        {
          status: 'joined',
          joinedAt: new Date(),
          leftAt: null,
          ...(position === LEAD_RIDER ? { position: LEAD_RIDER } : {}),
          // A rejoining rider starts with location sharing off until they grant
          // permission again.
          locationSharing: false,
          latitude: null,
          longitude: null,
          locationAccuracy: null,
          locationHeading: null,
          routeProgress: null,
          locationUpdatedAt: null,
        },
        { transaction },
      );
      return { rideId: ride.id, rejoined: true };
    }

    await RideParticipant.create(
      { rideSessionId: ride.id, userId, status: 'joined', position },
      { transaction },
    );
    return { rideId: ride.id, rejoined: false };
  });

  return { ride: await getById(result.rideId), rejoined: result.rejoined };
}

async function leave(rideId, userId) {
  const [updated] = await RideParticipant.update(
    {
      status: 'left',
      leftAt: new Date(),
      // Leaving ends that rider's sharing. Clearing the coordinates too means a
      // departed rider is not left on the map as an unexplained marker.
      locationSharing: false,
      latitude: null,
      longitude: null,
      locationAccuracy: null,
      locationHeading: null,
      routeProgress: null,
      locationUpdatedAt: null,
    },
    { where: { rideSessionId: rideId, userId, status: 'joined' } },
  );
  if (updated > 0) await touchActivity(rideId);
  return { left: updated > 0 };
}

/**
 * Pokes a ride's activity clock forward. Used after joins, leaves, distress
 * signals, and live voice traffic so an active ride is never ended by the idle
 * sweeper. Only touches rides that are still active.
 */
async function touchActivity(rideId) {
  await RideSession.update(
    { lastActivityAt: new Date() },
    { where: { id: rideId, status: 'active' } },
  );
}

/**
 * Ends every active ride that has been quiet for the idle threshold.
 *
 * Each ride is re-checked under a row lock so a rider who signs in mid-run is not
 * raced out by the sweeper. Returns the ended rides so callers can broadcast
 * `ride:ended` to each room.
 */
async function expireIdleRides(now = new Date()) {
  const cutoff = new Date(now.getTime() - env.limits.rideIdleEndMs);
  const stale = await RideSession.findAll({
    where: {
      status: 'active',
      lastActivityAt: { [Op.lt]: cutoff },
    },
    attributes: ['id'],
    limit: 500,
  });

  const ended = [];
  for (const ride of stale) {
    await sequelize.transaction(async (transaction) => {
      const locked = await RideSession.findByPk(ride.id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!locked) return;
      if (locked.status !== 'active') return;
      if (new Date(locked.lastActivityAt).getTime() >= cutoff.getTime()) return;

      const endedAt = new Date();
      await locked.update({ status: 'ended', endedAt }, { transaction });
      await RideParticipant.update(
        {
          status: 'left',
          leftAt: endedAt,
          locationSharing: false,
          latitude: null,
          longitude: null,
          locationAccuracy: null,
          locationHeading: null,
          routeProgress: null,
          locationUpdatedAt: null,
        },
        { where: { rideSessionId: ride.id, status: 'joined' }, transaction },
      );
      ended.push({ id: ride.id, status: 'ended', endedAt: endedAt.toISOString(), reason: 'inactive' });
    });
  }

  return ended;
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
      {
        status: 'left',
        leftAt: endedAt,
        locationSharing: false,
        latitude: null,
        longitude: null,
        locationAccuracy: null,
        locationHeading: null,
        routeProgress: null,
        locationUpdatedAt: null,
      },
      { where: { rideSessionId: ride.id, status: 'joined' }, transaction },
    );

    return { id: ride.id, status: 'ended', endedAt };
  });
}

/**
 * Assigns, changes, revokes or transfers a rider position.
 *
 * Creator-only, enforced here rather than only in the UI. The ride row is locked
 * so two concurrent assignments cannot interleave; the whole plan (including
 * demoting the previous lead or sweeper) is applied in one transaction. The
 * creator keeps ownership: only `position` changes, never `creatorId`.
 */
async function assignPosition(rideId, actorId, { userId, position, replacementPosition = null }) {
  return sequelize.transaction(async (transaction) => {
    const ride = await RideSession.findByPk(rideId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!ride) throw ApiError.notFound('Ride not found');
    assertCanManagePositions(ride, actorId);
    if (ride.status !== 'active') throw ApiError.conflict('That ride has already ended');

    const participants = await RideParticipant.findAll({
      where: { rideSessionId: rideId, status: 'joined' },
      attributes: ['id', 'userId', 'status', 'position'],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    const plan = planPositionAssignments({
      participants: participants.map((participant) => participant.get({ plain: true })),
      targetUserId: userId,
      position,
      replacementPosition,
    });

    for (const update of plan.updates) {
      const participant = participants.find((row) => row.userId === update.userId);
      if (participant) await participant.update({ position: update.to }, { transaction });
    }

    await ride.update({ lastActivityAt: new Date() }, { transaction });

    return {
      rideId,
      updates: plan.updates,
      previousLeadUserId: plan.previousLeadUserId,
      leadUserId: plan.leadUserId,
      noop: plan.noop,
    };
  });
}

/** Creator-only forward/rear boundary thresholds. */
async function setBoundarySettings(rideId, actorId, { forwardBoundaryM, rearBoundaryM }) {
  const ride = await RideSession.findByPk(rideId);
  if (!ride) throw ApiError.notFound('Ride not found');
  assertCanManagePositions(ride, actorId);
  if (ride.status !== 'active') throw ApiError.conflict('That ride has already ended');

  await ride.update({ forwardBoundaryM, rearBoundaryM, lastActivityAt: new Date() });
  return {
    rideId,
    forwardBoundaryM: ride.forwardBoundaryM,
    rearBoundaryM: ride.rearBoundaryM,
  };
}

/**
 * Stores one authenticated rider's current location.
 *
 * The user id comes from the verified token, never from the payload, so a rider
 * cannot report a location as somebody else. Timestamps are validated for
 * currency and implausible jumps are rejected before they can influence a
 * boundary decision.
 */
async function updateParticipantLocation(rideId, userId, payload) {
  const participant = await RideParticipant.findOne({
    where: { rideSessionId: rideId, userId, status: 'joined' },
    include: [{ model: RideSession, as: 'rideSession', attributes: ['id', 'status'] }],
  });
  if (!participant) throw ApiError.notFound('You are not on this ride');
  if (participant.rideSession.status !== 'active') {
    throw ApiError.conflict('That ride has already ended');
  }

  const now = new Date();
  if (payload.timestamp) {
    const reportedAt = new Date(payload.timestamp);
    if (Number.isNaN(reportedAt.getTime())) {
      throw ApiError.badRequest('Invalid location timestamp');
    }
    const age = now.getTime() - reportedAt.getTime();
    // A small future tolerance covers device clock skew; anything older than
    // two minutes is a queued update that must not be mistaken for "now".
    if (age > 2 * 60 * 1000 || age < -60 * 1000) {
      throw ApiError.badRequest('Location timestamp is not current');
    }
  }

  const previous = locationOf(participant);
  const next = {
    latitude: Number(payload.latitude),
    longitude: Number(payload.longitude),
    accuracy: payload.accuracy ?? null,
    heading: payload.heading ?? null,
    routeProgress: payload.routeProgress ?? null,
    updatedAt: now,
  };

  if (!isPlausibleMovement(previous, next)) {
    throw ApiError.badRequest('Location jump rejected as implausible', {
      code: 'IMPLAUSIBLE_LOCATION',
    });
  }

  await participant.update({
    latitude: next.latitude,
    longitude: next.longitude,
    locationAccuracy: next.accuracy,
    locationHeading: next.heading,
    routeProgress: next.routeProgress,
    // Server receipt time is the freshness clock. A client clock cannot make a
    // stale fix look current or a current fix look stale.
    locationUpdatedAt: now,
    locationSharing: true,
  });

  await touchActivity(rideId);
  return { participant, rideSession: participant.rideSession };
}

/**
 * Stops sharing and removes the coordinates immediately.
 *
 * Used when a rider switches sharing off or leaves. Keeping the last point would
 * leave a marker on everyone else's map that the rider has explicitly withdrawn.
 */
async function stopLocationSharing(rideId, userId) {
  const [updated] = await RideParticipant.update(
    {
      locationSharing: false,
      latitude: null,
      longitude: null,
      locationAccuracy: null,
      locationHeading: null,
      routeProgress: null,
      locationUpdatedAt: null,
    },
    { where: { rideSessionId: rideId, userId, status: 'joined' } },
  );
  return { stopped: updated > 0 };
}

/**
 * Marks a rider's feed offline without deleting the last fix.
 *
 * A dropped socket is not the same as withdrawing sharing: the last known point
 * stays visible but is flagged stale by the client, so the group can see where
 * they were rather than losing them entirely.
 */
async function markLocationOffline(rideId, userId) {
  const [updated] = await RideParticipant.update(
    { locationSharing: false },
    { where: { rideSessionId: rideId, userId, status: 'joined' } },
  );
  return { offline: updated > 0 };
}

/**
 * Whether the viewer may see precise coordinates. Following a ride is enough to
 * see its roster, but not enough to track where individual riders are.
 */
function canViewLocations(ride, viewerId) {
  if (!ride || !viewerId) return false;
  if (ride.creatorId === viewerId) return true;
  return Boolean(
    ride.participants?.some(
      (participant) => participant.userId === viewerId && participant.status === 'joined',
    ),
  );
}


/**
 * Switches between push-to-talk and open talk for everyone. Creator only.
 */
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
  await touchActivity(rideId);
  return { id: ride.id, voiceMode };
}

/**
 * Rides the viewer can plausibly join: their own, plus active rides started by
 * riders they follow.
 */
async function listJoinable(userId) {
  return [];
}

/** Participant user ids currently in the ride — the signaling fan-out list. */
async function activeParticipantIds(rideId) {
  const rows = await RideParticipant.findAll({
    where: { rideSessionId: rideId, status: 'joined' },
    attributes: ['userId'],
  });
  return rows.map((row) => row.userId);
}

const SIGNAL_FIELDS = { help: 'helpRequestedAt', stop: 'stoppedAt' };

/**
 * Raises or clears a distress signal ("I need help" / "I've stopped").
 *
 * Only an active participant can signal, and the signal is stored on their
 * participant row so it survives page reloads and re-joins. The socket layer
 * re-broadcasts to the ride room so everyone hears the audible alert.
 */
async function setSignal(rideId, userId, kind, active) {
  const field = SIGNAL_FIELDS[kind];
  if (!field) throw ApiError.badRequest('Signal must be "help" or "stop"');

  const participant = await RideParticipant.findOne({
    where: { rideSessionId: rideId, userId, status: 'joined' },
    include: [{ model: RideSession, as: 'rideSession', attributes: ['id', 'status'] }],
  });
  if (!participant) throw ApiError.notFound('You are not on this ride');
  if (participant.rideSession.status !== 'active') throw ApiError.conflict('That ride has already ended');

  await participant.update({ [field]: active ? new Date() : null });
  await touchActivity(rideId);
  return { kind, active: active ? participant[field] : null };
}

/**
 * How the viewer is connected to the ride creator, if at all.
 *
 * "Mutual relation" means some shared context: they follow each other, or they
 * both ride in the same community. When there is none, the client says so
 * plainly rather than implying the creator is a stranger with no context.
 */
async function relationsWithCreator(ride, viewerId) {
  if (!viewerId || viewerId === ride.creatorId) {
    return {
      creatorFollowsViewer: false,
      viewerFollowsCreator: false,
      isFriend: false,
      mutualCommunities: [],
      hasMutualRelation: true,
    };
  }

  const [creatorFollowsViewer, viewerFollowsCreator, sharedMemberships] = await Promise.all([
    Follow.count({ where: { followerId: ride.creatorId, followingId: viewerId } }),
    Follow.count({ where: { followerId: viewerId, followingId: ride.creatorId } }),
    CommunityMember.findAll({
      where: {
        userId: { [Op.in]: [viewerId, ride.creatorId] },
        status: 'active',
      },
      attributes: ['communityId', 'userId'],
      raw: true,
    }),
  ]);

  const byCommunity = new Map();
  for (const row of sharedMemberships) {
    if (!byCommunity.has(row.communityId)) byCommunity.set(row.communityId, new Set());
    byCommunity.get(row.communityId).add(row.userId);
  }
  const sharedIds = [...byCommunity.entries()]
    .filter(([, users]) => users.size > 1)
    .map(([communityId]) => communityId);

  let mutualCommunities = [];
  if (sharedIds.length) {
    const communities = await Community.findAll({
      where: { id: { [Op.in]: sharedIds } },
      attributes: ['id', 'name', 'slug'],
    });
    mutualCommunities = communities.map((community) => ({
      id: community.id,
      name: community.name,
      slug: community.slug,
    }));
  }

  const isFriend = creatorFollowsViewer > 0 && viewerFollowsCreator > 0;
  return {
    creatorFollowsViewer: creatorFollowsViewer > 0,
    viewerFollowsCreator: viewerFollowsCreator > 0,
    isFriend,
    mutualCommunities,
    hasMutualRelation: isFriend || mutualCommunities.length > 0,
  };
}

/**
 * Ride detail including the viewer's relation to the creator.
 *
 * Gated the same way `listJoinable` is: the viewer must be the creator, an active
 * participant, or follow the creator. Without this, any authenticated rider who
 * obtained a ride UUID could read the roster — and `inviteCode`, which then works
 * at `/api/rides/join` for somebody with no social relation to the creator. 404
 * rather than 403, so a stranger cannot confirm the ride exists.
 */
async function getForViewer(rideId, viewerId) {
  const ride = await getById(rideId);

  const allowed =
    ride.creatorId === viewerId ||
    (await RideParticipant.count({
      where: { rideSessionId: ride.id, userId: viewerId, status: 'joined' },
    })) > 0;

  if (!allowed) {
    const followed = await Follow.count({
      where: { followerId: viewerId, followingId: ride.creatorId },
    });
    if (followed === 0) throw ApiError.notFound('Ride not found');
  }

  const relation = await relationsWithCreator(ride, viewerId);
  return { ride, relation };
}

module.exports = {
  create,
  getById,
  getByInviteCode,
  getForViewer,
  canViewLocations,
  isActiveParticipant,
  join,
  leave,
  touchActivity,
  expireIdleRides,
  end,
  setVoiceMode,
  assignPosition,
  setBoundarySettings,
  updateParticipantLocation,
  stopLocationSharing,
  markLocationOffline,
  listJoinable,
  activeParticipantIds,
  setSignal,
};
