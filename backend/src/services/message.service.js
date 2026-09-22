'use strict';

/**
 * Message persistence and history.
 *
 * Sends are idempotent when the client supplies a nonce: a retry after a dropped
 * socket resolves to the message already stored rather than posting it twice.
 */

const { Op } = require('sequelize');

const env = require('../config/env');
const logger = require('../config/logger');
const { Message, Conversation, ConversationMember, User, sequelize } = require('../models');
const ApiError = require('../utils/ApiError');
const { normalizeLimit, decodeCursor, buildPage } = require('../utils/pagination');
const conversationService = require('./conversation.service');
const communityService = require('./community.service');
const notificationService = require('./notification.service');

/** Trims and length-checks content before it reaches the database. */
function normalizeContent(raw) {
  const content = String(raw ?? '').trim();
  if (!content) throw ApiError.badRequest('Message cannot be empty');
  if (content.length > env.limits.maxMessageLength) {
    throw ApiError.badRequest(
      `Message cannot exceed ${env.limits.maxMessageLength} characters`,
      { code: 'MESSAGE_TOO_LONG' },
    );
  }
  return content;
}

/**
 * Nudges the other rider in a direct thread. Runs on the microtask queue so
 * message delivery latency never waits on notification fan-out, and a failure
 * here can never affect the stored message. Community threads have no single
 * recipient, so only direct conversations are notified.
 */
async function notifyDirectRecipient(conversationId, senderId, message) {
  const conversation = await Conversation.findByPk(conversationId, { attributes: ['id', 'type'] });
  if (!conversation || conversation.type !== 'direct') return;

  const members = await ConversationMember.findAll({
    where: { conversationId, userId: { [Op.ne]: senderId } },
    attributes: ['userId'],
  });
  const recipientId = members[0]?.userId;
  if (!recipientId) return;

  await notificationService.create({
    userId: recipientId,
    actorId: senderId,
    type: 'message',
    entityType: 'conversation',
    entityId: conversationId,
    data: { conversationId, messageId: message.id, content: message.content },
  });
}

/**
 * Persists a message.
 *
 * Membership is re-checked inside the transaction: a rider removed from a community
 * a moment ago must not get one last message through.
 */
async function send(conversationId, senderId, { content, clientNonce = null }) {
  const body = normalizeContent(content);
  const nonce = clientNonce ? String(clientNonce).slice(0, 64) : null;

  try {
    const message = await sequelize.transaction(async (transaction) => {
      const membership = await ConversationMember.findOne({
        where: { conversationId, userId: senderId },
        transaction,
      });
      if (!membership) throw ApiError.notFound('Conversation not found');

      const created = await Message.create(
        { conversationId, senderId, content: body, clientNonce: nonce },
        { transaction },
      );

      // Drives conversation-list ordering without a subquery at read time.
      await Conversation.update(
        { lastMessageAt: created.createdAt },
        { where: { id: conversationId }, transaction },
      );

      return created;
    });

    message.sender = await User.findByPk(senderId);

    // A duplicate (nonce replay) already delivered the first time; never nudge
    // the recipient twice for the same message.
    if (!duplicate) {
      queueMicrotask(() => {
        notifyDirectRecipient(conversationId, senderId, message).catch((error) =>
          logger.warn({ error: error.message, conversationId }, 'message notification failed'),
        );
      });
    }

    return { message, duplicate: false };
  } catch (error) {
    // A repeated nonce means this exact send already succeeded.
    if (error.name === 'SequelizeUniqueConstraintError' && nonce) {
      const existing = await Message.findOne({
        where: { conversationId, clientNonce: nonce },
        include: [{ model: User, as: 'sender' }],
      });
      if (existing) return { message: existing, duplicate: true };
    }
    throw error;
  }
}

/**
 * Newest-first history page.
 *
 * Returned in ascending order for direct rendering, while pagination walks
 * backwards through `createdAt`.
 */
async function history(conversationId, userId, { limit, cursor } = {}) {
  await conversationService.assertAccess(conversationId, userId);

  const pageSize = normalizeLimit(limit, 40);
  const decoded = decodeCursor(cursor);

  const where = { conversationId };
  if (decoded?.createdAt) where.createdAt = { [Op.lt]: new Date(decoded.createdAt) };

  const rows = await Message.findAll({
    where,
    include: [{ model: User, as: 'sender', required: false }],
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    limit: pageSize + 1,
  });

  const page = buildPage(rows, pageSize, (row) => ({ createdAt: row.createdAt.toISOString() }));

  return {
    items: page.items.map((row) => row.toJSONSafe()).reverse(),
    pageInfo: page.pageInfo,
  };
}

/**
 * Soft-deletes a message. The author may always remove their own; in a community
 * thread a moderator or above may remove anyone's.
 */
async function remove(messageId, actorId) {
  const message = await Message.findByPk(messageId);
  if (!message) throw ApiError.notFound('Message not found');

  await conversationService.assertAccess(message.conversationId, actorId);

  if (message.senderId !== actorId) {
    const conversation = await Conversation.findByPk(message.conversationId);
    if (conversation?.type !== 'community') {
      throw ApiError.forbidden('You can only delete your own messages');
    }
    await communityService.requireRole(conversation.communityId, actorId, 'moderator');
  }

  await message.destroy();
  return { id: message.id, conversationId: message.conversationId };
}

module.exports = { send, history, remove, normalizeContent };
