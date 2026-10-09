'use strict';

/**
 * Socket.IO connection authentication.
 *
 * Runs as middleware, so an unauthenticated socket never reaches a single event
 * handler. The identity established here is the *only* one the handlers trust —
 * `socket.data.userId` is set from the verified token, never from client payloads.
 */

const { User } = require('../models');
const logger = require('../config/logger');
const tokenService = require('../services/token.service');

/** Accepts the token from the handshake auth payload or an Authorization header. */
function extractToken(socket) {
  const fromAuth = socket.handshake.auth?.token;
  if (typeof fromAuth === 'string' && fromAuth.trim()) return fromAuth.trim();

  const header = socket.handshake.headers?.authorization;
  if (typeof header === 'string') {
    const [scheme, value] = header.split(' ');
    if (/^Bearer$/i.test(scheme) && value) return value.trim();
  }
  return null;
}

module.exports = async function socketAuth(socket, next) {
  try {
    const token = extractToken(socket);
    if (!token) return next(new Error('UNAUTHORIZED'));

    const payload = tokenService.verifyAccessToken(token);

    const user = await User.findByPk(payload.sub);
    if (!user) return next(new Error('UNAUTHORIZED'));

    // A socket outlives a suspension, so it has to apply the same gate the HTTP
    // middleware does. Without this an ejected rider keeps every room it joined.
    if (user.status === 'suspended') return next(new Error('UNAUTHORIZED'));

    socket.data.userId = user.id;
    socket.data.username = user.username;
    // Rooms this socket has been authorized into, so leave/rejoin needs no re-query.
    // On connection-state recovery Socket.IO restores the socket's rooms but this
    // middleware re-runs, so rebuild the set from the rooms it actually kept —
    // otherwise `disconnecting` iterates nothing and `leave` no-ops.
    socket.data.rides = new Set(
      [...socket.rooms]
        .filter((room) => room.startsWith('ride:'))
        .map((room) => room.slice('ride:'.length)),
    );

    return next();
  } catch (error) {
    // Never log the token itself — only that verification failed.
    logger.debug({ reason: error.message }, 'socket authentication rejected');
    return next(new Error('UNAUTHORIZED'));
  }
};

module.exports.extractToken = extractToken;
