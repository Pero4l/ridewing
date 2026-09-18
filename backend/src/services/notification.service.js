'use strict';

/**
 * Notifications.
 *
 * Rows are always persisted first, then pushed over Socket.IO if the rider happens
 * to be connected. That ordering means a notification is never lost because
 * somebody was offline at the moment it fired.
 */

const { Op } = require('sequelize');

const { Notification, User } = require('../models');
const emailService = require('./email.service');
const pushService = require('./push.service');
const env = require('../config/env');
const logger = require('../config/logger');
const { normalizeLimit, decodeCursor, buildPage } = require('../utils/pagination');

// Set by the socket layer at boot. Kept as a setter so the service has no static
// dependency on Socket.IO and stays unit-testable.
let emitter = null;

function setEmitter(fn) {
  emitter = fn;
}

async function create({ userId, actorId = null, type, entityType = null, entityId = null, data = {} }) {
  // Nobody needs telling about their own actions.
  if (actorId && actorId === userId) return null;

  const notification = await Notification.create({
    userId,
    actorId,
    type,
    entityType,
    entityId,
    data,
  });

  if (actorId) {
    notification.actor = await User.findByPk(actorId);
  }

  // Admin notifications fire on their own Brevo seam — fire-and-forget, so a
  // failed (or unconfigured) transactional send never touches the notification row.
  if (env.email.enabled && env.admin.emails.length) {
    queueMicrotask(async () => {
      try {
        await emailService.sendTransactional({
          to: env.admin.emails,
          subject: `RideWing admin alert: ${type}`,
          html: `<p>New notification for user ${userId} — type <strong>${type}</strong>.</p>`,
        });
      } catch (error) {
        logger.warn({ error: error.message }, 'admin notification email failed');
      }
    });
  }

  if (emitter) {
    try {
      emitter(userId, notification.toJSONSafe());
    } catch (error) {
      // A failed push must never roll back the stored notification.
      logger.warn({ err: error, userId }, 'failed to push notification over socket');
    }
  }

  // Web Push is a separate delivery lane for when the rider is not on a socket.
  // Fire-and-forget like the admin mail — a dead device must never affect the row.
  if (pushService.enabled()) {
    queueMicrotask(async () => {
      try {
        await pushService.sendToUser(userId, buildPushPayload(notification));
      } catch (error) {
        logger.warn({ error: error.message, userId }, 'web push delivery failed');
      }
    });
  }

  return notification;
}

/**
 * The web push payload mirrors what the in-app notification row describes. The
 * service worker renders the full message client-side, so no extra fetch is
 * needed at show time; `siteNotifications` is the wire shape the worker reads.
 */
function buildPushPayload(notification) {
  const actor = notification.actor?.displayName ?? notification.actor?.username ?? "Someone";
  const { type, entityType, entityId, id, data } = notification;

  const copy = { title: "RideWing", body: "You have a new notification" };
  switch (type) {
    case 'post_like': copy.title = `${actor} liked your post`; break;
    case 'post_comment': copy.title = `${actor} commented on your post`; break;
    case 'comment_reply': copy.title = `${actor} replied to your comment`; break;
    case 'post_share': copy.title = `${actor} shared your post`; break;
    case 'follow': copy.title = `${actor} followed you`; break;
    case 'community_join_request': copy.title = `${actor} wants to join your community`; break;
    case 'community_join_approved': copy.title = 'Your community request was approved'; break;
    case 'community_join_rejected': copy.title = 'Your community request was declined'; break;
    case 'community_role_changed': copy.title = 'Your community role changed'; break;
    case 'ride_invite': copy.title = `${actor} invited you to a ride`; break;
    case 'message': copy.title = `${actor} sent you a message`; break;
    case 'support_ticket': copy.title = 'Your support ticket was resolved'; break;
    default: break;
  }

  return {
    siteNotifications: [{ ...copy, type, entityType, entityId, notificationId: id, data }],
  };
}

/** Fan-out helper for community events. */
async function createMany(recipientIds, payload) {
  const unique = [...new Set(recipientIds)].filter((id) => id !== payload.actorId);
  return Promise.all(unique.map((userId) => create({ ...payload, userId })));
}

async function list(userId, { limit, cursor, unreadOnly } = {}) {
  const pageSize = normalizeLimit(limit);
  const decoded = decodeCursor(cursor);

  const where = { userId };
  if (unreadOnly) where.readAt = null;
  if (decoded?.createdAt) where.createdAt = { [Op.lt]: new Date(decoded.createdAt) };

  const rows = await Notification.findAll({
    where,
    include: [{ model: User, as: 'actor', required: false }],
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    limit: pageSize + 1,
  });

  const page = buildPage(rows, pageSize, (row) => ({ createdAt: row.createdAt.toISOString() }));
  return {
    items: page.items.map((row) => row.toJSONSafe()),
    pageInfo: page.pageInfo,
  };
}

async function unreadCount(userId) {
  return Notification.count({ where: { userId, readAt: null } });
}

/** Scoped by `userId` so one rider can never mark another's notifications read. */
async function markRead(userId, notificationIds) {
  const where = { userId, readAt: null };
  if (Array.isArray(notificationIds) && notificationIds.length) {
    where.id = { [Op.in]: notificationIds };
  }
  const [updated] = await Notification.update({ readAt: new Date() }, { where });
  return updated;
}

module.exports = { setEmitter, create, createMany, list, unreadCount, markRead };
