'use strict';

/**
 * Socket.IO bootstrap.
 *
 * Authentication runs as middleware, so no handler is ever reachable by an
 * unauthenticated socket. Each connection is placed in its own `user:<id>` room,
 * which is how notifications reach a rider across however many tabs they have open.
 */

const { Server } = require('socket.io');

const env = require('../config/env');
const logger = require('../config/logger');
const socketAuth = require('./socketAuth');
const registerChatHandlers = require('./chat.handlers');
const registerRideHandlers = require('./ride.handlers');
const emit = require('./emit');
const { userRoom } = require('./rooms');
const notificationService = require('../services/notification.service');
const userService = require('../services/user.service');

function createSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: env.corsOrigins,
      credentials: true,
    },
    // Give a reconnecting rider a window to resume rather than losing buffered events.
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
      skipMiddlewares: false, // re-authenticate on recovery
    },
    pingInterval: 25000,
    pingTimeout: 20000,
    maxHttpBufferSize: 1e6,
  });

  io.use(socketAuth);

  io.on('connection', async (socket) => {
    const { userId, username } = socket.data;

    await socket.join(userRoom(userId));
    logger.debug({ userId, socketId: socket.id, recovered: socket.recovered }, 'socket connected');

    // Tell the client it is fully authenticated and ready.
    socket.emit('connection:ready', {
      userId,
      username,
      socketId: socket.id,
      recovered: socket.recovered,
    });

    registerChatHandlers(io, socket);
    registerRideHandlers(io, socket);

    socket.on('presence:ping', () => {
      userService.touchLastSeen(userId).catch(() => {
        // Presence is advisory; failures must not disturb the connection.
      });
    });

    socket.on('disconnect', (reason) => {
      logger.debug({ userId, socketId: socket.id, reason }, 'socket disconnected');
    });
  });

  // Let controllers and services broadcast without importing this module.
  emit.register(io);
  notificationService.setEmitter((targetUserId, payload) => {
    io.to(userRoom(targetUserId)).emit('notification:new', payload);
  });

  return io;
}

module.exports = { createSocketServer };
