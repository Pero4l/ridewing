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

  if (emitter) {
    try {
      emitter(userId, notification.toJSONSafe());
    } catch (error) {
      // A failed push must never roll back the stored notification.
      logger.warn({ err: error, userId }, 'failed to push notification over socket');
    }
  }

  return notification;
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
