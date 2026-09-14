'use strict';

const asyncHandler = require('../utils/asyncHandler');
const conversationService = require('../services/conversation.service');
const messageService = require('../services/message.service');
const { emitToConversation } = require('../sockets/emit');

const listConversations = asyncHandler(async (req, res) => {
  const conversations = await conversationService.listForUser(req.user.id);
  res.json({ conversations });
});

const openDirect = asyncHandler(async (req, res) => {
  const { conversation, created, participant } = await conversationService.getOrCreateDirect(
    req.user.id,
    req.body.username,
  );
  res.status(created ? 201 : 200).json({
    conversation: {
      id: conversation.id,
      type: conversation.type,
      participants: [participant.toPublicJSON()],
    },
  });
});

const history = asyncHandler(async (req, res) => {
  const page = await messageService.history(
    req.params.conversationId,
    req.user.id,
    req.validatedQuery,
  );
  res.json(page);
});

/**
 * HTTP send path — a fallback for when the socket is down. It broadcasts over
 * Socket.IO too, so clients receive it identically either way.
 */
const sendMessage = asyncHandler(async (req, res) => {
  const { message, duplicate } = await messageService.send(
    req.params.conversationId,
    req.user.id,
    req.body,
  );

  if (!duplicate) {
    emitToConversation(message.conversationId, 'message:new', message.toJSONSafe());
  }

  res.status(duplicate ? 200 : 201).json({ message: message.toJSONSafe(), duplicate });
});

const markRead = asyncHandler(async (req, res) => {
  const result = await conversationService.markRead(req.params.conversationId, req.user.id);
  res.json(result);
});

const deleteMessage = asyncHandler(async (req, res) => {
  const result = await messageService.remove(req.params.messageId, req.user.id);
  emitToConversation(result.conversationId, 'message:deleted', { id: result.id });
  res.json(result);
});

module.exports = {
  listConversations,
  openDirect,
  history,
  sendMessage,
  markRead,
  deleteMessage,
};
