'use strict';

/**
 * Ride positions.
 *
 * A participant has exactly one *primary* position. The list is intentionally
 * small and operational: the forward boundary is defined by the Lead Rider and
 * the rear boundary by the Sweeper, so those two are unique. Every other
 * position may be held by more than one rider (a large group can have several
 * marshals), and FORMATION_RIDER is the safe default.
 *
 * Pure functions live here so the permission and transfer rules can be tested
 * without a database. The service layer is responsible for locking rows and
 * persisting the plan atomically.
 */

const ApiError = require('./ApiError');

const RIDE_POSITIONS = Object.freeze([
  'LEAD_RIDER',
  'ASSISTANT_ROAD_CAPTAIN',
  'ROAD_MARSHAL',
  'SWEEPER',
  'NAVIGATION_OFFICER',
  'SAFETY_OFFICER',
  'SUPPORT_RECOVERY_RIDER',
  'FORMATION_RIDER',
]);

const RIDE_POSITION_VALUES = new Set(RIDE_POSITIONS);
const DEFAULT_RIDE_POSITION = 'FORMATION_RIDER';
const LEAD_RIDER = 'LEAD_RIDER';
const SWEEPER = 'SWEEPER';

/** Positions that only one rider may hold at a time. */
const UNIQUE_POSITIONS = new Set([LEAD_RIDER, SWEEPER]);

/** Roles that make up ride leadership and should hear about boundary events. */
const LEADERSHIP_POSITIONS = new Set([
  LEAD_RIDER,
  ASSISTANT_ROAD_CAPTAIN,
  ROAD_MARSHAL,
  SWEEPER,
  SAFETY_OFFICER,
]);

function isRidePosition(value) {
  return RIDE_POSITION_VALUES.has(value);
}

/**
 * Only the original creator may manage positions.
 *
 * Leadership is deliberately *not* sufficient: transferring LEAD_RIDER must not
 * transfer the right to decide who leads next. This is the one check every
 * position API and socket path relies on.
 */
function assertCanManagePositions(ride, actorId) {
  if (!ride) throw ApiError.notFound('Ride not found');
  if (ride.creatorId !== actorId) {
    throw ApiError.forbidden('Only the ride creator can manage ride positions');
  }
}

function activeParticipants(participants = []) {
  return participants.filter((participant) => participant.status !== 'left');
}

function findPosition(participants, position, exceptUserId) {
  return participants.find(
    (participant) => participant.position === position && participant.userId !== exceptUserId,
  );
}

/**
 * Works out the minimal set of position changes for a creator's assignment.
 *
 * Rules encoded here:
 *  - A participant always ends up with exactly one position.
 *  - LEAD_RIDER and SWEEPER are unique; assigning a second holder demotes the
 *    previous one rather than leaving two active boundaries.
 *  - A lead can only be replaced by assigning LEAD_RIDER to somebody else. To
 *    "remove" the lead without a successor would leave the group with no
 *    forward boundary, so that request is rejected.
 *  - The previous lead gets `replacementPosition`, or FORMATION_RIDER when the
 *    creator does not choose one.
 *
 * @returns {{updates: Array<{userId: string, from: string, to: string}>, previousLeadUserId: string|null, leadUserId: string|null}}
 */
function planPositionAssignments({
  participants,
  targetUserId,
  position,
  replacementPosition = null,
}) {
  if (!isRidePosition(position)) {
    throw ApiError.badRequest('Unknown ride position');
  }
  if (replacementPosition !== null && !isRidePosition(replacementPosition)) {
    throw ApiError.badRequest('Unknown replacement position');
  }
  if (replacementPosition === LEAD_RIDER) {
    throw ApiError.badRequest('The replacement position cannot also be Lead Rider');
  }

  const roster = activeParticipants(participants);
  const target = roster.find((participant) => participant.userId === targetUserId);
  if (!target) throw ApiError.notFound('That rider is not on this ride');

  const currentLead = roster.find((participant) => participant.position === LEAD_RIDER);
  const previousLeadUserId = currentLead?.userId ?? null;

  // Removing the only lead without naming a successor would leave the group
  // with no forward boundary. The creator has to transfer leadership instead.
  if (
    target.position === LEAD_RIDER &&
    position !== LEAD_RIDER &&
    currentLead?.userId === targetUserId
  ) {
    throw ApiError.conflict('Assign Lead Rider to another rider to transfer leadership');
  }

  const final = new Map(roster.map((participant) => [participant.userId, participant.position]));
  final.set(targetUserId, position);

  // A new lead replaces the old one. The creator may explicitly choose the
  // replacement role; otherwise the old lead becomes a formation rider.
  if (position === LEAD_RIDER && previousLeadUserId && previousLeadUserId !== targetUserId) {
    final.set(previousLeadUserId, replacementPosition ?? DEFAULT_RIDE_POSITION);
  }

  // Keep the rear boundary unambiguous. If the replacement role is also
  // Sweeper, the previous sweeper steps down as well.
  if (position === SWEEPER) {
    const oldSweeper = findPosition(roster, SWEEPER, targetUserId);
    if (oldSweeper) final.set(oldSweeper.userId, DEFAULT_RIDE_POSITION);
  }
  if (replacementPosition === SWEEPER) {
    const oldSweeper = roster.find(
      (participant) => participant.position === SWEEPER && participant.userId !== targetUserId,
    );
    if (oldSweeper) final.set(oldSweeper.userId, DEFAULT_RIDE_POSITION);
  }

  // Defensive: the transaction is atomic, but a plan that leaves two leads or
  // two sweepers must never reach the database.
  for (const unique of UNIQUE_POSITIONS) {
    const holders = [...final.entries()].filter(([, value]) => value === unique);
    if (holders.length > 1) {
      const keeper = unique === LEAD_RIDER ? targetUserId : holders[0][0];
      holders.forEach(([userId]) => {
        if (userId !== keeper) final.set(userId, DEFAULT_RIDE_POSITION);
      });
    }
  }

  const updates = [];
  for (const participant of roster) {
    const next = final.get(participant.userId);
    if (next && next !== participant.position) {
      updates.push({ userId: participant.userId, from: participant.position, to: next });
    }
  }

  if (position === LEAD_RIDER) {
    const lead = roster.find((participant) => participant.userId === targetUserId);
    return {
      updates,
      previousLeadUserId,
      leadUserId: targetUserId,
      // The target may already have been the lead, in which case the plan is
      // intentionally empty.
      noop: updates.length === 0 && lead?.position === LEAD_RIDER,
    };
  }

  return {
    updates,
    previousLeadUserId,
    leadUserId: previousLeadUserId,
    noop: updates.length === 0,
  };
}

module.exports = {
  RIDE_POSITIONS,
  RIDE_POSITION_VALUES,
  DEFAULT_RIDE_POSITION,
  LEAD_RIDER,
  SWEEPER,
  UNIQUE_POSITIONS,
  LEADERSHIP_POSITIONS,
  isRidePosition,
  assertCanManagePositions,
  planPositionAssignments,
  findPosition,
};
