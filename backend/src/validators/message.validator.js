'use strict';

const { z } = require('zod');
const env = require('../config/env');
const { uuid, username, pagination } = require('./common.validator');

const conversationParam = z.object({ conversationId: uuid }).strict();

const sendMessage = z
  .object({
    // Either a note, a forwarded post, or both. The note is allowed to be blank
    // here (unlike `messageContent`) precisely because a shared post can stand on
    // its own; the refine below is what decides whether the message is sendable.
    content: z
      .string()
      .trim()
      .max(env.limits.maxMessageLength, `Message cannot exceed ${env.limits.maxMessageLength} characters`)
      .optional()
      .default(''),
    // Lets a rider forward a post into a thread. The post itself is loaded and
    // serialized server-side, so a client cannot smuggle in content of its own.
    sharedPostId: uuid.optional(),
    // Client-generated idempotency key so retries after a dropped socket do not
    // duplicate the message.
    clientNonce: z.string().trim().min(8).max(64).optional(),
  })
  .strict()
  .refine((value) => Boolean(value.content) || Boolean(value.sharedPostId), {
    message: 'Message cannot be empty',
    path: ['content'],
  });

const openDirect = z.object({ username }).strict();

const historyQuery = pagination.strict();

const messageParam = z.object({ messageId: uuid }).strict();

module.exports = { conversationParam, sendMessage, openDirect, historyQuery, messageParam };
