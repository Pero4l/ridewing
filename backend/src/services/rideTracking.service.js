'use strict';

/**
 * Live ride tracking orchestration.
 *
 * Owns the in-memory confirmation/hysteresis state for boundary alerts and the
 * fan-out of location, position and monitoring events. The database is the
 * source of truth for memberships and last coordinates; this module only keeps
 * *derived* alert state, which is intentionally ephemeral (a process restart
 * should not resurrect an old warning).
 */

const logger = require('../config/logger');
const { RideParticipant, RideSession } = require('../models');
const rideService = require('./ride.service');
const notificationService = require('./notification.service');
const { emitToRide, emitToUser } = require('../sockets/emit');
const {
  advanceBoundaryState,
  evaluateRiderBoundary,
  monitorStatus,
} = require('../utils/rideBoundary');
const { LEADERSHIP_POSITIONS } = require('../utils/ridePositions');

const BOUNDARY_MESSAGES = {
  ahead: 'You are ahead of the Lead Rider. Please ride safely and remain with your group.',
  behind: 'You are behind the Sweeper. Your group may be moving out of range.',
};

const boundaryStates = new Map(); // `${rideId}:${userId}` -> state
const lastMonitorStatus = new Map(); // rideId -> serialised status

function stateKey(rideId, userId) {
  return `${rideId}:${userId}`;
}

function participantAttributes() {
  return [
    'userId',
    'position',
    'status',
    'latitude',
    'longitude',
    'locationAccuracy',
    'locationHeading',
    'routeProgress',
    'locationUpdatedAt',
    'locationSharing',
  ];
}

async function participantsFor(rideId) {
  return RideParticipant.findAll({
    where: { rideSessionId: rideId, status: 'joined' },
    attributes: participantAttributes(),
  });
}

async function rideFor(rideId) {
  return RideSession.findByPk(rideId, {
    attributes: ['id', 'status', 'creatorId', 'forwardBoundaryM', 'rearBoundaryM'],
  });
}

function distanceFor(alert) {
  const value = alert.zone === 'ahead' ? alert.aheadMeters : alert.behindMeters;
  return value == null ? null : Math.round(value);
}

function alertPayload({ rideId, participant, evaluation, renotify, now }) {
  const alert = {
    alertId: `${rideId}:${participant.userId}:${evaluation.zone}:${now}`,
    rideId,
    userId: participant.userId,
    position: participant.position,
    zone: evaluation.zone,
    distanceMeters: distanceFor(evaluation),
    message: BOUNDARY_MESSAGES[evaluation.zone],
    renotify: Boolean(renotify),
    leadUserId: evaluation.leadUserId,
    sweeperUserId: evaluation.sweeperUserId,
    forwardLimited: evaluation.forwardLimited,
    rearLimited: evaluation.rearLimited,
    at: new Date(now).toISOString(),
  };
  return alert;
}

function clearPayload({ rideId, userId, position, zone, reason, now = Date.now() }) {
  return {
    rideId,
    userId,
    position,
    zone,
    reason,
    message:
      reason === 'recovered'
        ? 'You are back with the group.'
        : 'Boundary monitoring is limited until rider locations are available again.',
    at: new Date(now).toISOString(),
  };
}

function publishMonitorStatus(rideId, status, { force = false } = {}) {
  const serialised = JSON.stringify(status);
  if (!force && lastMonitorStatus.get(rideId) === serialised) return;
  lastMonitorStatus.set(rideId, serialised);
  emitToRide(rideId, 'ride:monitor-status', { rideId, ...status });
}

/** Leader/creator recipients for a boundary event, excluding the affected rider. */
function leadershipRecipients(participants, ride, affectedUserId) {
  const recipients = new Set();
  if (ride?.creatorId) recipients.add(ride.creatorId);
  for (const participant of participants) {
    if (LEADERSHIP_POSITIONS.has(participant.position)) recipients.add(participant.userId);
  }
  recipients.delete(affectedUserId);
  return [...recipients];
}

async function notifyLeadership({ rideId, alert, participants, ride }) {
  const recipients = leadershipRecipients(participants, ride, alert.userId);
  await Promise.all(
    recipients.map((userId) =>
      notificationService
        .create({
          userId,
          actorId: alert.userId,
          type: 'ride_boundary',
          entityType: 'ride',
          entityId: rideId,
          data: {
            rideId,
            zone: alert.zone,
            distanceMeters: alert.distanceMeters,
            position: alert.position,
          },
        })
        .catch((error) => {
          logger.warn(
            { err: error, rideId, userId, zone: alert.zone },
            'failed to store ride boundary notification',
          );
        }),
    ),
  );
}

/**
 * Accepts a location report, broadcasts it, and advances boundary monitoring.
 *
 * `userId` must come from the authenticated socket/session, never the payload.
 */
async function reportLocation({ rideId, userId, payload }) {
  const { participant } = await rideService.updateParticipantLocation(rideId, userId, payload);
  const [participants, ride] = await Promise.all([participantsFor(rideId), rideFor(rideId)]);
  const now = Date.now();

  // Broadcast the accepted fix to the authenticated ride room. Non-participants
  // cannot join this room, and getForViewer strips coordinates from HTTP reads.
  emitToRide(rideId, 'ride:location', {
    rideId,
    userId,
    position: participant.position,
    latitude: Number(participant.latitude),
    longitude: Number(participant.longitude),
    accuracy: participant.locationAccuracy == null ? null : Number(participant.locationAccuracy),
    heading: participant.locationHeading == null ? null : Number(participant.locationHeading),
    routeProgress: participant.routeProgress == null ? null : Number(participant.routeProgress),
    updatedAt: participant.locationUpdatedAt,
  });

  const thresholds = {
    forward: Number(ride?.forwardBoundaryM ?? 500),
    rear: Number(ride?.rearBoundaryM ?? 800),
  };

  const alerts = [];
  const clears = [];

  for (const row of participants) {
    const key = stateKey(rideId, row.userId);
    const previous = boundaryStates.get(key);
    const evaluation = evaluateRiderBoundary({
      rider: row,
      participants,
      thresholds,
      now,
      previousZone: previous?.zone ?? null,
    });

    if (row.userId === userId) {
      const advanced = advanceBoundaryState(previous, evaluation, now);
      boundaryStates.set(key, advanced.state);

      if (advanced.event === 'alert') {
        const alert = alertPayload({
          rideId,
          participant: row,
          evaluation,
          renotify: advanced.renotify,
          now,
        });
        alerts.push(alert);
        emitToRide(rideId, 'ride:boundary-alert', alert);
        // The affected rider might be viewing the ride without a live socket
        // room seat; their personal room guarantees delivery.
        emitToUser(row.userId, 'ride:boundary-alert', alert);
        void notifyLeadership({ rideId, alert, participants, ride });
      } else if (advanced.event === 'clear') {
        const clear = clearPayload({
          rideId,
          userId: row.userId,
          position: row.position,
          zone: previous?.zone ?? null,
          reason: advanced.reason,
          now,
        });
        clears.push(clear);
        emitToRide(rideId, 'ride:boundary-clear', clear);
        emitToUser(row.userId, 'ride:boundary-clear', clear);
      }
      continue;
    }

    // Another rider's update can prove that a warning is over (they caught up),
    // but it must never be the second observation that *confirms* a warning for
    // somebody else. Confirmation always requires two of that rider's own fixes.
    if (previous?.zone && (evaluation.zone === 'inside' || evaluation.zone === 'unknown')) {
      const clear = clearPayload({
        rideId,
        userId: row.userId,
        position: row.position,
        zone: previous.zone,
        reason: evaluation.zone === 'inside' ? 'recovered' : 'monitoring-limited',
        now,
      });
      boundaryStates.delete(key);
      clears.push(clear);
      emitToRide(rideId, 'ride:boundary-clear', clear);
      emitToUser(row.userId, 'ride:boundary-clear', clear);
    }
  }

  const status = monitorStatus(participants, now);
  publishMonitorStatus(rideId, status);

  return { alerts, clears, status };
}

/** A rider turned sharing off, or left the ride: remove their coordinates. */
async function stopSharing({ rideId, userId }) {
  await rideService.stopLocationSharing(rideId, userId);
  const previous = boundaryStates.get(stateKey(rideId, userId));
  boundaryStates.delete(stateKey(rideId, userId));

  const payload = {
    rideId,
    userId,
    at: new Date().toISOString(),
    removed: true,
  };
  emitToRide(rideId, 'ride:rider-offline', payload);
  emitToUser(userId, 'ride:rider-offline', payload);

  if (previous?.zone) {
    const clear = clearPayload({
      rideId,
      userId,
      position: null,
      zone: previous.zone,
      reason: 'sharing-stopped',
    });
    emitToRide(rideId, 'ride:boundary-clear', clear);
  }

  const [participants, ride] = await Promise.all([participantsFor(rideId), rideFor(rideId)]);
  if (ride) publishMonitorStatus(rideId, monitorStatus(participants), { force: true });
  return { stopped: true };
}

/**
 * A socket dropped. The last fix is kept (so the group can see where the rider
 * was) but sharing is marked off and the freshness clock will make it stale.
 */
async function markOffline({ rideId, userId }) {
  await rideService.markLocationOffline(rideId, userId);
  const previous = boundaryStates.get(stateKey(rideId, userId));
  boundaryStates.delete(stateKey(rideId, userId));

  const payload = {
    rideId,
    userId,
    at: new Date().toISOString(),
    removed: false,
  };
  emitToRide(rideId, 'ride:rider-offline', payload);
  emitToUser(userId, 'ride:rider-offline', payload);

  if (previous?.zone) {
    const clear = clearPayload({
      rideId,
      userId,
      position: null,
      zone: previous.zone,
      reason: 'monitoring-limited',
    });
    emitToRide(rideId, 'ride:boundary-clear', clear);
  }

  const [participants, ride] = await Promise.all([participantsFor(rideId), rideFor(rideId)]);
  if (ride) publishMonitorStatus(rideId, monitorStatus(participants), { force: true });
}

/** Emits roster position changes and notifies the affected riders. */
async function publishPositionChanges({ rideId, updates, actorId }) {
  if (!updates?.length) return;
  const payload = {
    rideId,
    updates,
    changedBy: actorId,
    at: new Date().toISOString(),
  };
  emitToRide(rideId, 'ride:position', payload);

  for (const update of updates) {
    boundaryStates.delete(stateKey(rideId, update.userId));
    emitToUser(update.userId, 'ride:position', payload);

    // The actor already knows what they did; nobody needs a notification for
    // their own action.
    if (update.userId === actorId) continue;
    try {
      await notificationService.create({
        userId: update.userId,
        actorId,
        type: 'ride_position',
        entityType: 'ride',
        entityId: rideId,
        data: {
          rideId,
          position: update.to,
          previousPosition: update.from,
        },
      });
    } catch (error) {
      logger.warn(
        { err: error, rideId, userId: update.userId },
        'failed to store ride position notification',
      );
    }
  }

  const [participants, ride] = await Promise.all([participantsFor(rideId), rideFor(rideId)]);
  if (ride) publishMonitorStatus(rideId, monitorStatus(participants), { force: true });
}

/** A rider left the ride; their coordinates were already cleared by leave(). */
async function riderLeft({ rideId, userId }) {
  boundaryStates.delete(stateKey(rideId, userId));
  emitToRide(rideId, 'ride:rider-offline', {
    rideId,
    userId,
    at: new Date().toISOString(),
    removed: true,
  });

  const [participants, ride] = await Promise.all([participantsFor(rideId), rideFor(rideId)]);
  if (ride) publishMonitorStatus(rideId, monitorStatus(participants), { force: true });
}

/** Called when a ride ends or is cancelled: no monitoring may survive it. */
function clearRide(rideId) {
  for (const key of boundaryStates.keys()) {
    if (key.startsWith(`${rideId}:`)) boundaryStates.delete(key);
  }
  lastMonitorStatus.delete(rideId);
}

/** Test seam: reset all in-memory state. */
function resetState() {
  boundaryStates.clear();
  lastMonitorStatus.clear();
}

module.exports = {
  reportLocation,
  stopSharing,
  markOffline,
  riderLeft,
  publishPositionChanges,
  clearRide,
  resetState,
};
