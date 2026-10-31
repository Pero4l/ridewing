'use strict';

/**
 * Group-formation boundary calculations.
 *
 * Two boundaries matter on a ride:
 *   - forward: the Lead Rider
 *   - rear:    the Sweeper
 *
 * No map-matching service or route geometry exists in RideWing today, so this is
 * a deliberately documented GPS approximation. When clients supply a
 * `routeProgress` value (0..1 along the planned route) it is used to decide
 * *ordering* along the road, with straight-line separation deciding magnitude.
 * Otherwise the group axis from Sweeper to Lead is used: a rider projected past
 * the Lead by more than the forward threshold is ahead, and one projected behind
 * the Sweeper is behind. That is more robust than raw distance (which flags a
 * rider 600 m to the side of the road) and it degrades to "unknown" rather than
 * inventing a violation when the group axis is too short or the data is stale.
 *
 * Everything here is pure so the thresholds, hysteresis, confirmation window and
 * stale-data rules can be tested without a database or sockets.
 */

const LOCATION_FRESH_MS = 90 * 1000;
/** A violation must be seen on two reports from the same rider, at least this far apart. */
const CONFIRM_AFTER_MS = 3 * 1000;
/** A pending violation that is not re-confirmed within this window is discarded. */
const PENDING_TTL_MS = 45 * 1000;
/** Re-notify a still-unresolved violation no more often than this. */
const ALERT_COOLDOWN_MS = 120 * 1000;
/** Release the warning once the rider is back inside this fraction of the threshold. */
const CLEAR_FACTOR = 0.7;
/** Below this group axis length, direction along the road cannot be inferred. */
const MIN_AXIS_METERS = 40;
/** Anything beyond this is treated as a GPS jump / spoofing, not movement. */
const MAX_PLAUSIBLE_SPEED_MPS = 150;

const DEFAULT_FORWARD_BOUNDARY_METERS = 500;
const DEFAULT_REAR_BOUNDARY_METERS = 800;

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance in metres. */
function haversineMeters(a, b) {
  const earthRadius = 6_371_000;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(h)));
}

function locationOf(participant) {
  if (!participant) return null;
  if (
    participant.latitude === null ||
    participant.latitude === undefined ||
    participant.longitude === null ||
    participant.longitude === undefined
  ) {
    return null;
  }
  return {
    latitude: Number(participant.latitude),
    longitude: Number(participant.longitude),
    accuracy: participant.locationAccuracy == null ? null : Number(participant.locationAccuracy),
    heading: participant.locationHeading == null ? null : Number(participant.locationHeading),
    routeProgress: participant.routeProgress == null ? null : Number(participant.routeProgress),
    updatedAt: participant.locationUpdatedAt
      ? new Date(participant.locationUpdatedAt).getTime()
      : null,
    sharing: participant.locationSharing !== false,
  };
}

function isFresh(location, now = Date.now(), maxAgeMs = LOCATION_FRESH_MS) {
  if (!location || !location.updatedAt) return false;
  if (!Number.isFinite(location.updatedAt)) return false;
  const age = now - location.updatedAt;
  return age >= -5_000 && age <= maxAgeMs;
}

/** Local tangent-plane offset in metres (good enough at motorcycle-group scale). */
function localOffset(origin, point) {
  const metresPerDegreeLat = 111_320;
  const metresPerDegreeLng = metresPerDegreeLat * Math.cos(toRadians(origin.latitude));
  return {
    x: (point.longitude - origin.longitude) * metresPerDegreeLng,
    y: (point.latitude - origin.latitude) * metresPerDegreeLat,
  };
}

function isPlausibleMovement(previous, next) {
  if (!previous || !next) return true;
  const previousAt = previous.updatedAt ? new Date(previous.updatedAt).getTime() : null;
  const nextAt = next.updatedAt ? new Date(next.updatedAt).getTime() : null;
  if (!previousAt || !nextAt) return true;

  const seconds = (nextAt - previousAt) / 1000;
  if (seconds <= 0 || seconds > 5 * 60) return true; // a long gap says nothing useful

  const distance = haversineMeters(previous, next);
  if (seconds < 2 && distance > 500) return false;
  return distance / Math.max(seconds, 0.5) <= MAX_PLAUSIBLE_SPEED_MPS;
}

function axisBoundary({ riderLocation, leadLocation, sweeperLocation }) {
  if (!leadLocation || !sweeperLocation) return null;

  const offset = localOffset(sweeperLocation, leadLocation);
  const groupLength = Math.hypot(offset.x, offset.y);
  if (groupLength < MIN_AXIS_METERS) return null;

  const riderOffset = localOffset(sweeperLocation, riderLocation);
  const along = (riderOffset.x * offset.x + riderOffset.y * offset.y) / groupLength;
  return {
    method: 'axis',
    aheadMeters: along - groupLength,
    behindMeters: -along,
  };
}

function headingBoundary({ fromLocation, toLocation }) {
  if (!fromLocation || fromLocation.heading == null || !Number.isFinite(fromLocation.heading)) {
    return null;
  }
  const offset = localOffset(fromLocation, toLocation);
  const heading = toRadians(fromLocation.heading);
  // Bearing convention: 0° is north, 90° is east.
  const projection = offset.x * Math.sin(heading) + offset.y * Math.cos(heading);
  return { method: 'heading', projection, distance: Math.hypot(offset.x, offset.y) };
}

/**
 * Classifies one rider against the group boundaries.
 *
 * @param {object} input
 * @param {object} input.rider participant row (position + last location)
 * @param {object[]} input.participants joined participants
 * @param {{forward?: number, rear?: number}} [input.thresholds]
 * @param {number} [input.now]
 * @param {'ahead'|'behind'|null} [input.previousZone] apply hysteresis against a confirmed zone
 */
function evaluateRiderBoundary({
  rider,
  participants,
  thresholds = {},
  now = Date.now(),
  previousZone = null,
}) {
  const forwardThreshold = Number(thresholds.forward ?? DEFAULT_FORWARD_BOUNDARY_METERS);
  const rearThreshold = Number(thresholds.rear ?? DEFAULT_REAR_BOUNDARY_METERS);

  const lead = participants.find(
    (participant) => participant.position === 'LEAD_RIDER' && participant.userId !== rider.userId,
  );
  const sweeper = participants.find(
    (participant) => participant.position === 'SWEEPER' && participant.userId !== rider.userId,
  );
  const selfIsLead = rider.position === 'LEAD_RIDER';
  const selfIsSweeper = rider.position === 'SWEEPER';

  const riderLocation = locationOf(rider);
  const leadLocation = locationOf(lead);
  const sweeperLocation = locationOf(sweeper);

  const riderFresh = isFresh(riderLocation, now);
  const forwardApplicable = !selfIsLead;
  const rearApplicable = !selfIsSweeper;

  const forwardAvailable = forwardApplicable && Boolean(lead) && isFresh(leadLocation, now);
  const rearAvailable = rearApplicable && Boolean(sweeper) && isFresh(sweeperLocation, now);

  const forwardReason = !forwardApplicable
    ? null
    : !lead
      ? 'no-lead'
      : !isFresh(leadLocation, now)
        ? 'lead-stale'
        : null;
  const rearReason = !rearApplicable
    ? null
    : !sweeper
      ? 'no-sweeper'
      : !isFresh(sweeperLocation, now)
        ? 'sweeper-stale'
        : null;

  if (!riderFresh) {
    return {
      zone: 'unknown',
      riderFresh: false,
      forwardLimited: forwardApplicable,
      rearLimited: rearApplicable,
      forwardReason: 'rider-stale',
      rearReason: 'rider-stale',
      leadUserId: lead?.userId ?? null,
      sweeperUserId: sweeper?.userId ?? null,
      aheadMeters: null,
      behindMeters: null,
      method: null,
    };
  }

  const routeAhead =
    leadLocation &&
    forwardAvailable &&
    riderLocation.routeProgress != null &&
    leadLocation.routeProgress != null
      ? riderLocation.routeProgress > leadLocation.routeProgress &&
        haversineMeters(riderLocation, leadLocation)
      : null;
  const routeBehind =
    sweeperLocation &&
    rearAvailable &&
    riderLocation.routeProgress != null &&
    sweeperLocation.routeProgress != null
      ? riderLocation.routeProgress < sweeperLocation.routeProgress &&
        haversineMeters(riderLocation, sweeperLocation)
      : null;

  let aheadMeters = routeAhead === false ? 0 : routeAhead || null;
  let behindMeters = routeBehind === false ? 0 : routeBehind || null;
  let method = routeAhead !== null || routeBehind !== null ? 'route' : null;
  let forwardContext = routeAhead !== null;
  let rearContext = routeBehind !== null;

  if (!method) {
    const axis = axisBoundary({ riderLocation, leadLocation, sweeperLocation });
    if (axis) {
      aheadMeters = axis.aheadMeters;
      behindMeters = axis.behindMeters;
      method = axis.method;
      forwardContext = true;
      rearContext = true;
    }
  }

  // A missing Sweeper or a short group axis can still leave one side usable when
  // the reference rider reports a heading. This is the narrowest fallback and is
  // only trusted for the side it can actually speak to.
  if (!forwardContext && forwardAvailable) {
    const heading = headingBoundary({ fromLocation: leadLocation, toLocation: riderLocation });
    if (heading && heading.projection > 0) {
      aheadMeters = heading.projection;
      forwardContext = true;
      method = 'heading';
    }
  }
  if (!rearContext && rearAvailable) {
    const heading = headingBoundary({ fromLocation: sweeperLocation, toLocation: riderLocation });
    if (heading && heading.projection < 0) {
      behindMeters = -heading.projection;
      rearContext = true;
      method = 'heading';
    }
  }

  const forwardLimited = forwardApplicable && (!forwardAvailable || !forwardContext);
  const rearLimited = rearApplicable && (!rearAvailable || !rearContext);

  const forwardClear = forwardThreshold * CLEAR_FACTOR;
  const rearClear = rearThreshold * CLEAR_FACTOR;
  const forwardGate = previousZone === 'ahead' ? forwardClear : forwardThreshold;
  const rearGate = previousZone === 'behind' ? rearClear : rearThreshold;

  const isAhead = forwardContext && aheadMeters != null && aheadMeters > forwardGate;
  const isBehind = rearContext && behindMeters != null && behindMeters > rearGate;

  let zone = 'inside';
  if (isAhead && isBehind) {
    zone = aheadMeters / forwardThreshold >= behindMeters / rearThreshold ? 'ahead' : 'behind';
  } else if (isAhead) {
    zone = 'ahead';
  } else if (isBehind) {
    zone = 'behind';
  } else if (!forwardContext && !rearContext) {
    zone = 'unknown';
  }

  return {
    zone,
    riderFresh: true,
    forwardLimited,
    rearLimited,
    forwardReason,
    rearReason,
    leadUserId: lead?.userId ?? null,
    sweeperUserId: sweeper?.userId ?? null,
    aheadMeters: aheadMeters == null ? null : Math.max(0, aheadMeters),
    behindMeters: behindMeters == null ? null : Math.max(0, behindMeters),
    method,
    forwardThreshold,
    rearThreshold,
  };
}

/**
 * Advances the confirmation/cooldown state machine for one rider.
 *
 * A single report never raises a confirmed alert. The same zone has to appear on
 * two reports at least CONFIRM_AFTER_MS apart; that filters out one bad fix from
 * a tunnel or a handover between towers.
 */
function advanceBoundaryState(state, evaluation, now = Date.now()) {
  const current = state ?? {
    zone: null,
    pendingZone: null,
    pendingAt: 0,
    lastAlertAt: 0,
    confirmedAt: 0,
  };

  const zone = evaluation.zone;
  if (zone === 'ahead' || zone === 'behind') {
    if (current.zone === zone) {
      if (now - current.lastAlertAt >= ALERT_COOLDOWN_MS) {
        return {
          state: { ...current, pendingZone: null, pendingAt: 0, lastAlertAt: now },
          event: 'alert',
          renotify: true,
        };
      }
      return { state: current, event: null, renotify: false };
    }

    const samePending = current.pendingZone === zone;
    const age = now - current.pendingAt;
    if (
      samePending &&
      age >= CONFIRM_AFTER_MS &&
      age <= PENDING_TTL_MS &&
      evaluation.riderFresh
    ) {
      return {
        state: {
          zone,
          pendingZone: null,
          pendingAt: 0,
          lastAlertAt: now,
          confirmedAt: now,
        },
        event: 'alert',
        renotify: false,
      };
    }

    return {
      state: { ...current, pendingZone: zone, pendingAt: samePending ? current.pendingAt : now },
      event: null,
      renotify: false,
    };
  }

  if (zone === 'inside') {
    if (current.zone) {
      return {
        state: { zone: null, pendingZone: null, pendingAt: 0, lastAlertAt: 0, confirmedAt: 0 },
        event: 'clear',
        reason: 'recovered',
        renotify: false,
      };
    }
    return {
      state: { ...current, pendingZone: null, pendingAt: 0 },
      event: null,
      renotify: false,
    };
  }

  // Unknown means the data needed to make a claim is missing or stale. Never
  // turn that into a confirmed violation; drop any previous warning so a stale
  // position is not presented as a live problem.
  if (current.zone) {
    return {
      state: { zone: null, pendingZone: null, pendingAt: 0, lastAlertAt: 0, confirmedAt: 0 },
      event: 'clear',
      reason: 'monitoring-limited',
      renotify: false,
    };
  }
  return {
    state: { ...current, pendingZone: null, pendingAt: 0 },
    event: null,
    renotify: false,
  };
}

/** Ride-level availability of each boundary reference. */
function monitorStatus(participants, now = Date.now()) {
  const lead = participants.find((participant) => participant.position === 'LEAD_RIDER');
  const sweeper = participants.find((participant) => participant.position === 'SWEEPER');
  const leadFresh = isFresh(locationOf(lead), now);
  const sweeperFresh = isFresh(locationOf(sweeper), now);

  return {
    forwardLimited: !lead || !leadFresh,
    rearLimited: !sweeper || !sweeperFresh,
    forwardReason: !lead ? 'no-lead' : !leadFresh ? 'lead-stale' : null,
    rearReason: !sweeper ? 'no-sweeper' : !sweeperFresh ? 'sweeper-stale' : null,
    leadUserId: lead?.userId ?? null,
    sweeperUserId: sweeper?.userId ?? null,
    updatedAt: new Date(now).toISOString(),
  };
}

module.exports = {
  LOCATION_FRESH_MS,
  CONFIRM_AFTER_MS,
  PENDING_TTL_MS,
  ALERT_COOLDOWN_MS,
  CLEAR_FACTOR,
  MIN_AXIS_METERS,
  MAX_PLAUSIBLE_SPEED_MPS,
  DEFAULT_FORWARD_BOUNDARY_METERS,
  DEFAULT_REAR_BOUNDARY_METERS,
  haversineMeters,
  locationOf,
  isFresh,
  isPlausibleMovement,
  evaluateRiderBoundary,
  advanceBoundaryState,
  monitorStatus,
};
