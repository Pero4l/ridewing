'use strict';

/**
 * Server-to-client emit helpers.
 *
 * The Socket.IO server instance is registered here at boot so HTTP controllers can
 * broadcast without importing the socket bootstrap (which would create a cycle).
 * Every helper is a no-op before registration, which keeps unit tests free of
 * socket setup.
 */

const { userRoom, conversationRoom, rideRoom } = require('./rooms');

let io = null;

function register(instance) {
  io = instance;
}

function getIO() {
  return io;
}

function emitToUser(userId, event, payload) {
  if (!io) return;
  io.to(userRoom(userId)).emit(event, payload);
}

function emitToConversation(conversationId, event, payload) {
  if (!io) return;
  io.to(conversationRoom(conversationId)).emit(event, payload);
}

function emitToRide(rideId, event, payload) {
  if (!io) return;
  io.to(rideRoom(rideId)).emit(event, payload);
}

/** Excludes the originating socket — used for typing indicators and presence. */
function emitToRideExcept(socket, rideId, event, payload) {
  if (!io) return;
  socket.to(rideRoom(rideId)).emit(event, payload);
}

/**
 * Fans a new message out to the thread room and to each member's personal room.
 *
 * Both HTTP and socket sends go through here so the two paths cannot drift. The
 * personal-room fan-out exists for members who are not seated in the thread, but
 * every member also *has* a personal room — so anyone already in the thread room
 * would otherwise receive the same message a second time.
 */
async function emitMessageNew(conversationId, payload, memberIds = []) {
  if (!io) return;
  const room = conversationRoom(conversationId);

  io.to(room).emit('message:new', payload);

  const seated = await io.in(room).fetchSockets();
  const seatedIds = new Set(
    seated.map((peer) => peer.data?.userId).filter((id) => typeof id === 'string'),
  );
  for (const memberId of new Set(memberIds)) {
    if (seatedIds.has(memberId)) continue;
    io.to(userRoom(memberId)).emit('message:new', payload);
  }
}

/**
 * Forcibly evicts a user's sockets from a room. Membership is checked when a
 * socket joins, but a ban or a removal only changes the database — without this
 * the already-connected socket keeps receiving that room's traffic.
 */
async function evictUserFromRoom(userId, roomName) {
  if (!io) return;
  try {
    await io.in(userRoom(userId)).socketsLeave(roomName);
  } catch {
    /* best-effort — the DB row is the source of truth */
  }
}

module.exports = {
  register,
  getIO,
  emitToUser,
  emitToConversation,
  emitToRide,
  emitToRideExcept,
  emitMessageNew,
  evictUserFromRoom,
};
