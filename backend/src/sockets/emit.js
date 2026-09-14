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

module.exports = {
  register,
  getIO,
  emitToUser,
  emitToConversation,
  emitToRide,
  emitToRideExcept,
};
