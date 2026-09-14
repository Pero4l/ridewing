'use strict';

/**
 * Canonical room names.
 *
 * Room strings are built here and nowhere else, so a client can never influence
 * the name of a room it ends up in.
 */

const userRoom = (userId) => `user:${userId}`;
const conversationRoom = (conversationId) => `conversation:${conversationId}`;
const rideRoom = (rideId) => `ride:${rideId}`;

module.exports = { userRoom, conversationRoom, rideRoom };
