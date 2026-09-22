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

  // Rider-facing email notifications. Same fire-and-forget seam as the admin
  // alert: a slow or unconfigured mail provider must never delay the response
  // or roll back the stored notification.
  if (env.email.enabled) {
    queueMicrotask(async () => {
      try {
        const recipient = await User.findByPk(userId, { attributes: ['id', 'email'] });
        if (!recipient?.email) return;
        const { subject, text, html } = buildEmailPayload(notification);
        await emailService.sendTransactional({ to: recipient.email, subject, text, html });
      } catch (error) {
        logger.warn({ error: error.message, userId, type }, 'notification email failed');
      }
    });
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

/**
 * The email copy for a notification. Mirrors the web-push/in-app copy so the
 * delivery lanes stay consistent; `button` deep-links back into the app.
 */
function buildEmailPayload(notification) {
  const actor = notification.actor;
  const actorName = actor?.displayName ?? actor?.username ?? 'Someone';
  const actorUsername = actor?.username;
  const { type, data = {} } = notification;

  const frontend = env.frontendUrl.replace(/\/+$/, '');
  const appHref = `${frontend}/app`;
  const postHref = appHref;
  const communitySlug = typeof data.communitySlug === 'string' ? data.communitySlug : null;
  const communityHref = communitySlug ? `${frontend}/app/communities/${communitySlug}` : appHref;
  const profileHref = actorUsername ? `${frontend}/app/profile/${actorUsername}` : null;

  let subject = 'New RideWing notification';
  let preview = `${actorName} did something on RideWing.`;
  let paragraphs = [];
  let button = null;

  switch (type) {
    case 'post_like':
      subject = `${actorName} liked your post`;
      preview = `${actorName} liked your post on RideWing.`;
      button = { href: postHref, label: 'View post' };
      break;
    case 'post_comment':
      subject = `${actorName} commented on your post`;
      preview = `${actorName} commented on your post on RideWing.`;
      button = { href: postHref, label: 'View post' };
      break;
    case 'comment_reply':
      subject = `${actorName} replied to your comment`;
      preview = `${actorName} replied to your comment on RideWing.`;
      button = { href: postHref, label: 'View post' };
      break;
    case 'post_share':
      subject = `${actorName} shared your post`;
      preview = `${actorName} shared your post on RideWing.`;
      button = { href: postHref, label: 'View post' };
      break;
    case 'follow':
      subject = `${actorName} followed you`;
      preview = `${actorName} is now following you on RideWing.`;
      button = profileHref ? { href: profileHref, label: `View @${actorUsername}` } : null;
      break;
    case 'community_join_request':
      subject = `${actorName} wants to join your community`;
      preview = `${actorName} has requested to join ${communitySlug ? `community ${communitySlug}` : 'your community'}.`;
      button = { href: communityHref, label: 'Review request' };
      break;
    case 'community_join_approved':
      subject = 'Your community request was approved';
      preview = `You can now take part in ${communitySlug ? `community ${communitySlug}` : 'your community'}.`;
      button = { href: communityHref, label: 'Open community' };
      break;
    case 'community_join_rejected':
      subject = 'Your community request was declined';
      preview = `Your request to join ${communitySlug ? `community ${communitySlug}` : 'a community'} was declined.`;
      break;
    case 'community_role_changed':
      subject = 'Your community role changed';
      preview = `Your role in ${communitySlug ? `community ${communitySlug}` : 'your community'} was updated.`;
      button = { href: communityHref, label: 'Open community' };
      break;
    case 'message': {
      subject = `${actorName} sent you a message`;
      const snippet = typeof data.content === 'string' ? data.content.trim() : '';
      preview = snippet ? `"${snippet.slice(0, 160)}"` : 'Tap through to read the message.';
      paragraphs = [`${actorName} sent you a message in RideWing.`];
      button = { href: `${frontend}/app/messages`, label: 'Read message' };
      break;
    }
    case 'ride_invite':
      subject = `${actorName} invited you to a ride`;
      preview = `${actorName} invited you to join a ride on RideWing.`;
      button = { href: `${frontend}/app/rides`, label: 'View ride' };
      break;
    case 'support_ticket':
      subject = 'Your support ticket was resolved';
      preview = `A member of the RideWing team resolved your support ticket${data.subject ? ` "${data.subject}"` : ''}.`;
      button = { href: `${frontend}/app/support`, label: 'View ticket' };
      break;
    default:
      break;
  }

  const text = [preview, ...paragraphs].join('\n');
  return {
    subject,
    text: `${subject}\n\n${text}`,
    html: emailService.renderHtml({ title: subject, preview, paragraphs, button }),
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
