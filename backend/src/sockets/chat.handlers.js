'use strict';

/**
 * Chat socket handlers.
 *
 * Three invariants hold throughout:
 *   1. The sender is `socket.data.userId` from the verified token — a `senderId` in
 *      the payload is ignored.
 *   2. Room membership is re-checked against the database on every join, and again
 *      on every send, so revoked access takes effect immediately.
 *   3. Every event answers through its acknowledgement callback, so the client can
 *      distinguish delivered from failed instead of waiting indefinitely.
 */

const { z } = require('zod');

const logger = require('../config/logger');
const env = require('../config/env');
const TokenBucket = require('../utils/TokenBucket');
const conversationService = require('../services/conversation.service');
const messageService = require('../services/message.service');
const { conversationRoom } = require('./rooms');
const { normalize } = require('../middleware/errorHandler');

const joinSchema = z.object({ conversationId: z.string().uuid() }).strict();

const sendSchema = z
  .object({
    conversationId: z.string().uuid(),
    content: z.string().min(1).max(env.limits.maxMessageLength),
    clientNonce: z.string().trim().min(8).max(64).optional(),
  })
  .strict();

const typingSchema = z
  .object({ conversationId: z.string().uuid(), isTyping: z.boolean() })
  .strict();

const readSchema = z.object({ conversationId: z.string().uuid() }).strict();

/** Normalizes any thrown value into a client-safe ack payload. */
function toAckError(error) {
  const apiError = normalize(error);
  return {
    ok: false,
    error: {
      message: apiError.expose ? apiError.message : 'Something went wrong',
      code: apiError.code || undefined,
    },
  };
}

/** Guards against a handler being called without a callback. */
const respond = (ack) => (payload) => {
  if (typeof ack === 'function') ack(payload);
};

module.exports = function registerChatHandlers(io, socket) {
  const userId = socket.data.userId;

  // ~5 messages/second sustained, short bursts allowed.
  const sendBucket = new TokenBucket({ capacity: 10, refillPerSecond: 5 });
  const typingBucket = new TokenBucket({ capacity: 10, refillPerSecond: 2 });

  socket.on('conversation:join', async (payload, ack) => {
    const reply = respond(ack);
    try {
      const { conversationId } = joinSchema.parse(payload);

      // Authorization before the join — never after.
      const allowed = await conversationService.canAccess(conversationId, userId);
      if (!allowed) return reply({ ok: false, error: { message: 'Conversation not found' } });

      await socket.join(conversationRoom(conversationId));
      return reply({ ok: true, conversationId });
    } catch (error) {
      return reply(toAckError(error));
    }
  });

  socket.on('conversation:leave', async (payload, ack) => {
    const reply = respond(ack);
    try {
      const { conversationId } = joinSchema.parse(payload);
      await socket.leave(conversationRoom(conversationId));
      return reply({ ok: true });
    } catch (error) {
      return reply(toAckError(error));
    }
  });

  socket.on('message:send', async (payload, ack) => {
    const reply = respond(ack);
    try {
      if (!sendBucket.tryRemove()) {
        return reply({
          ok: false,
          error: { message: 'You are sending messages too quickly', code: 'RATE_LIMITED' },
        });
      }

      const { conversationId, content, clientNonce } = sendSchema.parse(payload);

      // Re-check on every send: membership may have been revoked since the join.
      const allowed = await conversationService.canAccess(conversationId, userId);
      if (!allowed) return reply({ ok: false, error: { message: 'Conversation not found' } });

      const { message, duplicate } = await messageService.send(conversationId, userId, {
        content,
        clientNonce,
      });

      // A duplicate means the client already sent this; acknowledge without
      // re-broadcasting so nobody sees it twice.
      if (!duplicate) {
        io.to(conversationRoom(conversationId)).emit('message:new', message.toJSONSafe());
      }

      return reply({ ok: true, message: message.toJSONSafe(), duplicate });
    } catch (error) {
      logger.warn({ err: error, userId }, 'message send failed');
      return reply(toAckError(error));
    }
  });

  socket.on('message:typing', async (payload) => {
    try {
      if (!typingBucket.tryRemove()) return;
      const { conversationId, isTyping } = typingSchema.parse(payload);

      if (!(await conversationService.canAccess(conversationId, userId))) return;

      socket.to(conversationRoom(conversationId)).emit('message:typing', {
        conversationId,
        userId,
        username: socket.data.username,
        isTyping,
      });
    } catch {
      // Typing indicators are best-effort; a malformed payload is simply dropped.
    }
  });

  socket.on('conversation:read', async (payload, ack) => {
    const reply = respond(ack);
    try {
      const { conversationId } = readSchema.parse(payload);
      const result = await conversationService.markRead(conversationId, userId);
      return reply({ ok: true, ...result });
    } catch (error) {
      return reply(toAckError(error));
    }
  });
};

module.exports.toAckError = toAckError;
