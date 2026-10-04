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
const { Message, Conversation, ConversationMember, User, Post, sequelize } = require('../models');
const ApiError = require('../utils/ApiError');
const { normalizeLimit, decodeCursor, buildPage } = require('../utils/pagination');
const conversationService = require('./conversation.service');
const communityService = require('./community.service');
const emailService = require('./email.service');
const notificationService = require('./notification.service');

/**
 * Trims and length-checks content. Empty is allowed only alongside a shared post,
 * so "send them this" never has to be dressed up as a sentence.
 */
function normalizeContent(raw) {
  const content = String(raw ?? '').trim();
  if (content.length > env.limits.maxMessageLength) {
    throw ApiError.badRequest(
      `Message cannot exceed ${env.limits.maxMessageLength} characters`,
      { code: 'MESSAGE_TOO_LONG' },
    );
  }
  return content;
}

/** Loads the post a message forwards, rejecting one that has since been deleted. */
async function loadSharedPost(sharedPostId) {
  const post = await Post.findByPk(sharedPostId, { attributes: ['id'] });
  if (!post) throw ApiError.badRequest('That post is no longer available');
  return post;
}

/** Content and post together must produce a message worth storing. */
function assertSendable(content, sharedPostId) {
  if (!content && !sharedPostId) throw ApiError.badRequest('Message cannot be empty');
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
    data: { conversationId, messageId: message.id, content: message.content, sharedPostId: message.sharedPostId ?? null },
  });

  await emailSenderCopy(conversationId, senderId, recipientId, message);
}

/**
 * Confirms delivery to the rider who *sent* the message, so a message sent from
 * a phone that immediately locks is still traceable from their inbox. Best
 * effort: no email configured, or no address on file, simply means no mail.
 */
async function emailSenderCopy(conversationId, senderId, recipientId, message) {
  if (!env.email.enabled) return;

  const [sender, recipient] = await Promise.all([
    User.findByPk(senderId, { attributes: ['id', 'email', 'displayName', 'username'] }),
    User.findByPk(recipientId, { attributes: ['id', 'username'] }),
  ]);
  if (!sender?.email) return;

  const frontend = env.frontendUrl.replace(/\/+$/, '');
  const toName = recipient?.username ? `@${recipient.username}` : 'your rider';
  const subject = `You sent a message to ${toName}`;
  const snippet = String(message.content ?? '').trim();
  // A forwarded post with no note has nothing to quote, so the mail says what was
  // sent instead of printing an empty pair of quotes.
  const body = snippet ? `"${snippet}"` : 'You shared a post.';

  try {
    await emailService.sendTransactional({
      to: sender.email,
      subject,
      text: `${subject}\n\n${body}\n\n${frontend}/app/messages/${conversationId}`,
      html: emailService.renderHtml({
        title: subject,
        preview: 'A copy of your message, in case you need it later.',
        paragraphs: [snippet ? `"${snippet.slice(0, 300)}"` : 'You shared a post in this conversation.'],
        button: { href: `${frontend}/app/messages/${conversationId}`, label: 'Open conversation' },
      }),
    });
  } catch (error) {
    logger.warn({ error: error.message, conversationId }, 'sender email copy failed');
  }
}

/**
 * Persists a message.
 *
 * Membership is re-checked inside the transaction: a rider removed from a community
 * a moment ago must not get one last message through.
 *
 * `preloadedSharedPost` lets a caller that has already read the post (sharing from
 * the post itself) hand it over instead of paying for it to be fetched twice. The
 * foreign key still guards the write, so a post deleted in between is rejected by
 * the database rather than forwarded.
 */
async function send(conversationId, senderId, { content, clientNonce = null, sharedPostId = null, preloadedSharedPost = null }) {
  const body = normalizeContent(content);
  const postId = sharedPostId ? String(sharedPostId) : null;
  assertSendable(body, postId);
  const nonce = clientNonce ? String(clientNonce).slice(0, 64) : null;

  try {
    const message = await sequelize.transaction(async (transaction) => {
      const membership = await ConversationMember.findOne({
        where: { conversationId, userId: senderId },
        transaction,
      });
      if (!membership) throw ApiError.notFound('Conversation not found');

      // Verified inside the transaction so a post deleted between the tap and the
      // write cannot be forwarded.
      if (postId && !preloadedSharedPost) await loadSharedPost(postId);

      const created = await Message.create(
        { conversationId, senderId, content: body, sharedPostId: postId, clientNonce: nonce },
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
    message.sharedPost =
      preloadedSharedPost ??
      (postId
        ? await Post.findByPk(postId, {
            include: [{ model: User, as: 'user' }],
          })
        : null);

    // Only reached on a genuinely fresh row — a nonce replay returns from the
    // catch below, so the recipient is never nudged twice for the same message.
    queueMicrotask(() => {
      notifyDirectRecipient(conversationId, senderId, message).catch((error) =>
        logger.warn({ error: error.message, conversationId }, 'message notification failed'),
      );
    });

    return { message, duplicate: false };
  } catch (error) {
    // A repeated nonce means this exact send already succeeded.
    if (error.name === 'SequelizeUniqueConstraintError' && nonce) {
      const existing = await Message.findOne({
        where: { conversationId, clientNonce: nonce },
        include: [{ model: User, as: 'sender' }, { model: Post, as: 'sharedPost', required: false }],
      });
      if (existing) {
        // Nested includes are not eager-loaded, so the replayed post needs its
        // author attached separately or the recipient would see an unattributed card.
        if (existing.sharedPost) {
          existing.sharedPost.user = await User.findByPk(existing.sharedPost.userId);
        }
        return { message: existing, duplicate: true };
      }
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
    include: [
      { model: User, as: 'sender', required: false },
      { model: Post, as: 'sharedPost', required: false, include: [{ model: User, as: 'user' }] },
    ],
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
