'use strict';

/**
 * Ride socket handlers: presence and WebRTC signaling.
 *
 * V1 uses a full mesh, so peers are addressed by *socket id* rather than user id —
 * that keeps two tabs from the same rider as two distinct peers instead of one
 * ambiguous target. Every signaling message is checked twice: the sender must be in
 * the ride room, and so must the recipient. A client cannot use this channel to
 * reach anyone outside a ride it has joined.
 *
 * The offer/answer/candidate payloads themselves are opaque to the server — it
 * relays them without interpretation. Replacing the mesh with an SFU later means
 * changing who the client sends to, not this authorization logic.
 */

const { z } = require('zod');

const logger = require('../config/logger');
const TokenBucket = require('../utils/TokenBucket');
const rideService = require('../services/ride.service');
const rideTracking = require('../services/rideTracking.service');
const rideValidator = require('../validators/ride.validator');
const { rideRoom } = require('./rooms');
const { toAckError } = require('./chat.handlers');

const rideSchema = z.object({ rideId: z.string().uuid() }).strict();
const locationSchema = rideValidator.reportLocation
  .extend({ rideId: z.string().uuid() })
  .strict();

/** Per-socket throttle so live traffic does not hit the DB every signal. */
const activityTouch = new Map();
function touchRideActivity(socketId, rideId) {
  const now = Date.now();
  if ((activityTouch.get(socketId) ?? 0) > now - 60_000) return;
  activityTouch.set(socketId, now);
  rideService.touchActivity(rideId).catch(() => {});
}

// SDP blobs are large but bounded; a cap stops a client from using signaling as a
// data channel for arbitrary payloads.
const sdpSchema = z
  .object({
    rideId: z.string().uuid(),
    targetSocketId: z.string().min(1).max(64),
    description: z
      .object({
        type: z.enum(['offer', 'answer']),
        sdp: z.string().min(1).max(64_000),
      })
      .strict(),
  })
  .strict();

const candidateSchema = z
  .object({
    rideId: z.string().uuid(),
    targetSocketId: z.string().min(1).max(64),
    candidate: z
      .object({
        candidate: z.string().max(2000),
        sdpMid: z.string().max(100).nullable().optional(),
        sdpMLineIndex: z.number().int().min(0).max(64).nullable().optional(),
        usernameFragment: z.string().max(256).nullable().optional(),
      })
      .strict(),
  })
  .strict();

const voiceStateSchema = z
  .object({
    rideId: z.string().uuid(),
    isTransmitting: z.boolean(),
    isMuted: z.boolean(),
  })
  .strict();

const respond = (ack) => (payload) => {
  if (typeof ack === 'function') ack(payload);
};

module.exports = function registerRideHandlers(io, socket) {
  const userId = socket.data.userId;

  // Signaling is bursty during connection setup, then quiet.
  const signalBucket = new TokenBucket({ capacity: 120, refillPerSecond: 40 });
  const voiceStateBucket = new TokenBucket({ capacity: 20, refillPerSecond: 10 });
  // A fix roughly every two seconds is plenty for a group map; bursts cover a
  // reconnect while still bounding a client that tries to flood the room.
  const locationBucket = new TokenBucket({ capacity: 8, refillPerSecond: 0.5 });

  /** Sockets currently in the ride room, as peer descriptors for the client. */
  async function peersIn(rideId, excludeSocketId) {
    const sockets = await io.in(rideRoom(rideId)).fetchSockets();
    return sockets
      .filter((peer) => peer.id !== excludeSocketId)
      .map((peer) => ({
        socketId: peer.id,
        userId: peer.data.userId,
        username: peer.data.username,
      }));
  }

  /** True when the target socket is genuinely in this ride's room. */
  async function targetIsInRide(rideId, targetSocketId) {
    const sockets = await io.in(rideRoom(rideId)).fetchSockets();
    return sockets.some((peer) => peer.id === targetSocketId);
  }

  socket.on('ride:join', async (payload, ack) => {
    const reply = respond(ack);
    try {
      const { rideId } = rideSchema.parse(payload);

      // The database decides, not the client.
      const allowed = await rideService.isActiveParticipant(rideId, userId);
      if (!allowed) {
        return reply({
          ok: false,
          error: { message: 'You have not joined this ride', code: 'NOT_A_PARTICIPANT' },
        });
      }

      await socket.join(rideRoom(rideId));
      socket.data.rides.add(rideId);
      touchRideActivity(socket.id, rideId);

      const peers = await peersIn(rideId, socket.id);

      // Existing peers initiate toward the newcomer; the newcomer waits for offers.
      // Fixing the direction this way avoids simultaneous-offer glare entirely.
      socket.to(rideRoom(rideId)).emit('ride:peer-joined', {
        rideId,
        socketId: socket.id,
        userId,
        username: socket.data.username,
      });

      logger.debug({ rideId, userId, peerCount: peers.length }, 'rider joined ride room');
      return reply({ ok: true, rideId, selfSocketId: socket.id, peers });
    } catch (error) {
      return reply(toAckError(error));
    }
  });

  socket.on('ride:leave', async (payload, ack) => {
    const reply = respond(ack);
    try {
      const { rideId } = rideSchema.parse(payload);
      await leaveRide(rideId);
      return reply({ ok: true });
    } catch (error) {
      return reply(toAckError(error));
    }
  });

  /**
   * Watches a ride without joining the WebRTC mesh.
   *
   * The live map should work for a rider who has not opened voice. This joins
   * the same authenticated room, but records a separate membership so a map
   * tab closing does not release the participant row on disconnect.
   */
  socket.on('ride:watch', async (payload, ack) => {
    const reply = respond(ack);
    try {
      const { rideId } = rideSchema.parse(payload);
      const allowed = await rideService.isActiveParticipant(rideId, userId);
      if (!allowed) {
        return reply({
          ok: false,
          error: { message: 'You have not joined this ride', code: 'NOT_A_PARTICIPANT' },
        });
      }

      await socket.join(rideRoom(rideId));
      socket.data.watchRides.add(rideId);
      touchRideActivity(socket.id, rideId);
      return reply({ ok: true, rideId });
    } catch (error) {
      return reply(toAckError(error));
    }
  });

  socket.on('ride:unwatch', async (payload, ack) => {
    const reply = respond(ack);
    try {
      const { rideId } = rideSchema.parse(payload);
      socket.data.watchRides.delete(rideId);
      if (!socket.data.rides.has(rideId)) {
        await socket.leave(rideRoom(rideId));
      }
      return reply({ ok: true });
    } catch (error) {
      return reply(toAckError(error));
    }
  });

  function leaveRide(rideId) {
    if (!socket.data.rides.has(rideId)) return;
    socket.data.rides.delete(rideId);
    touchRideActivity(socket.id, rideId);

    // Voice peers are torn down either way, but a rider who is still watching
    // the map must stay in the room to keep receiving position updates.
    socket.to(rideRoom(rideId)).emit('ride:peer-left', { rideId, socketId: socket.id, userId });
    if (socket.data.watchRides?.has(rideId)) return Promise.resolve();
    return socket.leave(rideRoom(rideId));
  }

  /**
   * Live location report from the authenticated rider.
   *
   * The room membership is the authorisation check; the user id comes from the
   * socket, never the payload. Rate limiting here is per socket so one tab
   * cannot flood the ride, and the service validates freshness/plausibility.
   */
  socket.on('ride:location', async (payload, ack) => {
    const reply = respond(ack);
    try {
      if (!locationBucket.tryRemove()) {
        return reply({ ok: false, error: { message: 'Location updates are too frequent' } });
      }

      const { rideId, ...location } = locationSchema.parse(payload);
      if (!socket.rooms.has(rideRoom(rideId))) {
        return reply({ ok: false, error: { message: 'You are not watching this ride' } });
      }

      const result = await rideTracking.reportLocation({ rideId, userId, payload: location });
      touchRideActivity(socket.id, rideId);
      return reply({
        ok: true,
        alerts: result.alerts.length,
        clears: result.clears.length,
      });
    } catch (error) {
      return reply(toAckError(error));
    }
  });

  /** Relays an SDP offer or answer to one peer in the same ride. */
  socket.on('webrtc:signal', async (payload, ack) => {
    const reply = respond(ack);
    try {
      if (!signalBucket.tryRemove()) {
        return reply({ ok: false, error: { message: 'Signaling rate limit exceeded' } });
      }

      const { rideId, targetSocketId, description } = sdpSchema.parse(payload);

      // Sender must already be in the room — this is the authorization check.
      if (!socket.rooms.has(rideRoom(rideId))) {
        return reply({ ok: false, error: { message: 'You are not in this ride' } });
      }
      if (!(await targetIsInRide(rideId, targetSocketId))) {
        return reply({ ok: false, error: { message: 'That peer is not in this ride' } });
      }

      io.to(targetSocketId).emit('webrtc:signal', {
        rideId,
        fromSocketId: socket.id,
        fromUserId: userId,
        description,
      });

      touchRideActivity(socket.id, rideId);
      return reply({ ok: true });
    } catch (error) {
      return reply(toAckError(error));
    }
  });

  socket.on('webrtc:ice-candidate', async (payload, ack) => {
    const reply = respond(ack);
    try {
      if (!signalBucket.tryRemove()) {
        return reply({ ok: false, error: { message: 'Signaling rate limit exceeded' } });
      }

      const { rideId, targetSocketId, candidate } = candidateSchema.parse(payload);

      if (!socket.rooms.has(rideRoom(rideId))) {
        return reply({ ok: false, error: { message: 'You are not in this ride' } });
      }
      if (!(await targetIsInRide(rideId, targetSocketId))) {
        return reply({ ok: false, error: { message: 'That peer is not in this ride' } });
      }

      io.to(targetSocketId).emit('webrtc:ice-candidate', {
        rideId,
        fromSocketId: socket.id,
        fromUserId: userId,
        candidate,
      });

      touchRideActivity(socket.id, rideId);
      return reply({ ok: true });
    } catch (error) {
      return reply(toAckError(error));
    }
  });

  /**
   * Mute / transmitting state for the roster UI.
   *
   * This is presentation only — actual silence is enforced client-side by disabling
   * the audio track, so a rider who lies here still transmits nothing.
   */
  socket.on('ride:voice-state', (payload) => {
    try {
      if (!voiceStateBucket.tryRemove()) return;
      const { rideId, isTransmitting, isMuted } = voiceStateSchema.parse(payload);
      if (!socket.rooms.has(rideRoom(rideId))) return;

      // Somebody actually using their mic counts as ride activity.
      if (isTransmitting && !isMuted) touchRideActivity(socket.id, rideId);

      socket.to(rideRoom(rideId)).emit('ride:voice-state', {
        rideId,
        socketId: socket.id,
        userId,
        isTransmitting,
        isMuted,
      });
    } catch {
      // Best-effort presence signal.
    }
  });

  /** On disconnect, tell every ride this socket was in so peers can tear down. */
  socket.on('disconnecting', async () => {
    const voiceRides = [...socket.data.rides];
    const watchRides = [...(socket.data.watchRides ?? [])];
    const allRides = [...new Set([...voiceRides, ...watchRides])];

    for (const rideId of voiceRides) {
      socket.to(rideRoom(rideId)).emit('ride:peer-left', {
        rideId,
        socketId: socket.id,
        userId,
      });
    }

    // The throttle map is process-lifetime, so it must not outlive the socket.
    activityTouch.delete(socket.id);

    await Promise.all(
      allRides.map(async (rideId) => {
        try {
          const room = await io.in(rideRoom(rideId)).fetchSockets();
          const stillHere = room.some(
            (peer) => peer.id !== socket.id && peer.data?.userId === userId,
          );
          if (stillHere) return;

          // A map watcher only loses their feed. A voice participant also gives
          // up their ride slot, as before. Both cases are announced so the map
          // can mark the last fix as stale immediately rather than waiting for
          // the freshness clock.
          if (watchRides.includes(rideId) && !voiceRides.includes(rideId)) {
            await rideService.markLocationOffline(rideId, userId).catch(() => {});
          } else {
            await rideService.leave(rideId, userId);
          }

          socket.to(rideRoom(rideId)).emit('ride:rider-offline', {
            rideId,
            userId,
            at: new Date().toISOString(),
            removed: false,
          });
        } catch (error) {
          logger.warn({ err: error, rideId, userId }, 'failed to release participant on disconnect');
        }
      }),
    );
  });
};
