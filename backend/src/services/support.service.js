'use strict';

/**
 * Support tickets.
 *
 * Creation is open to every rider; resolution is the admin's job. Resolving
 * drops an in-app notification on the creator so socket/web-push delivery is
 * handled by the same lane as every other notification.
 */

const { SupportTicket, User } = require('../models');
const ApiError = require('../utils/ApiError');
const emailService = require('./email.service');
const notificationService = require('./notification.service');

async function create(userId, payload) {
  const { subject, body } = payload;

  const ticket = await SupportTicket.create({ userId, subject, body });
  ticket.creator = await User.findByPk(userId);

  // Fire-and-forget so a mail relay problem never rolls back the ticket.
  emailService.alertAdmins({
    subject: `RideWing: new support ticket (${subject})`,
    text: `New support ticket from ${ticket.creator?.displayName ?? userId}: ${subject}`,
    html: emailService.renderHtml({
      title: 'New support ticket',
      paragraphs: [
        `From: ${ticket.creator?.displayName ?? userId} (@${ticket.creator?.username ?? 'unknown'})`,
        `Subject: ${subject}`,
        `Description: ${body}`,
      ],
    }),
  });

  return ticket;
}

async function listMine(userId) {
  return SupportTicket.findAll({
    where: { userId },
    include: [
      { model: User, as: 'creator' },
      { model: User, as: 'resolver' },
    ],
    order: [['createdAt', 'DESC']],
  });
}

/** Admin queue: every ticket, optionally filtered by status. */
async function listAll({ status } = {}) {
  return SupportTicket.findAll({
    where: status ? { status } : {},
    include: [
      { model: User, as: 'creator' },
      { model: User, as: 'resolver' },
    ],
    order: [['createdAt', 'DESC']],
  });
}

async function resolve(ticketId, adminId, payload = {}) {
  const ticket = await SupportTicket.findOne({ where: { id: ticketId, status: 'open' } });
  if (!ticket) throw ApiError.notFound('Open ticket not found');

  await ticket.update({
    status: 'resolved',
    resolutionNote: payload.note || null,
    resolvedAt: new Date(),
    resolvedBy: adminId,
  });

  ticket.resolver = await User.findByPk(adminId);
  ticket.creator = await User.findByPk(ticket.userId);

  // Drop an in-app notification so the creator gets a live socket/web-push nudge.
  // Own-action guard in notification.service: on the (rare) case where an admin
  // resolves their own ticket nobody gets pinged about it.
  await notificationService.create({
    userId: ticket.userId,
    actorId: adminId,
    type: 'support_ticket',
    entityType: 'support_ticket',
    entityId: ticket.id,
    data: { subject: ticket.subject, status: 'resolved' },
  });

  return ticket;
}

/** Owner or admin may read a ticket. */
async function get(ticketId, viewerId, isAdmin = false) {
  const ticket = await SupportTicket.findByPk(ticketId, {
    include: [
      { model: User, as: 'creator' },
      { model: User, as: 'resolver' },
    ],
  });
  if (!ticket) throw ApiError.notFound('Ticket not found');
  if (!isAdmin && ticket.userId !== viewerId) {
    throw ApiError.forbidden('You do not have permission to do that');
  }
  return ticket;
}

module.exports = { create, listMine, listAll, resolve, get };