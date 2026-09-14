'use strict';

const { z } = require('zod');
const { uuid, username, messageContent, pagination } = require('./common.validator');

const conversationParam = z.object({ conversationId: uuid }).strict();

const sendMessage = z
  .object({
    content: messageContent,
    // Client-generated idempotency key so retries after a dropped socket do not
    // duplicate the message.
    clientNonce: z.string().trim().min(8).max(64).optional(),
  })
  .strict();

const openDirect = z.object({ username }).strict();

const historyQuery = pagination.strict();

const messageParam = z.object({ messageId: uuid }).strict();

module.exports = { conversationParam, sendMessage, openDirect, historyQuery, messageParam };
