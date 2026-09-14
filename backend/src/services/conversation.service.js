'use strict';

/**
 * Conversations — direct threads between two riders and the chat attached to each
 * community.
 *
 * `ConversationMember` is the single authority for access. Both the HTTP history
 * endpoints and the Socket.IO room joins consult `assertAccess` below, so there is
 * only one rule to audit.
 */

const { Op, QueryTypes } = require('sequelize');

const {
  Conversation,
  ConversationMember,
  Community,
  User,
  sequelize,
} = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Throws unless the rider is a member of the conversation.
 * Returns the conversation and the membership row for callers that need them.
 */
async function assertAccess(conversationId, userId, options = {}) {
  const membership = await ConversationMember.findOne({
    where: { conversationId, userId },
    ...options,
  });
  if (!membership) {
    // Deliberately 404, not 403: a non-member should not learn the thread exists.
    throw ApiError.notFound('Conversation not found');
  }

  const conversation = await Conversation.findByPk(conversationId, options);
  if (!conversation) throw ApiError.notFound('Conversation not found');

  return { conversation, membership };
}

/** Boolean form used by the socket layer, which prefers acks over exceptions. */
async function canAccess(conversationId, userId) {
  const membership = await ConversationMember.findOne({
    where: { conversationId, userId },
    attributes: ['id'],
  });
  return Boolean(membership);
}

/**
 * Finds or creates the direct thread between two riders.
 *
 * Concurrent opens race on the unique `directKey`; the loser catches the conflict
 * and re-reads, so both riders end up in the same conversation.
 */
async function getOrCreateDirect(userId, targetUsername) {
  const target = await User.findOne({ where: { username: String(targetUsername).toLowerCase() } });
  if (!target) throw ApiError.notFound('Rider not found');
  if (target.id === userId) throw ApiError.badRequest('You cannot message yourself');

  const directKey = Conversation.directKeyFor(userId, target.id);

  const existing = await Conversation.findOne({ where: { directKey } });
  if (existing) return { conversation: existing, created: false, participant: target };

  try {
    const conversation = await sequelize.transaction(async (transaction) => {
      const created = await Conversation.create({ type: 'direct', directKey }, { transaction });
      await ConversationMember.bulkCreate(
        [
          { conversationId: created.id, userId },
          { conversationId: created.id, userId: target.id },
        ],
        { transaction },
      );
      return created;
    });
    return { conversation, created: true, participant: target };
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      const raced = await Conversation.findOne({ where: { directKey } });
      if (raced) return { conversation: raced, created: false, participant: target };
    }
    throw error;
  }
}

async function getCommunityConversation(communityId) {
  const conversation = await Conversation.findOne({ where: { communityId } });
  if (!conversation) throw ApiError.notFound('Community chat not found');
  return conversation;
}

/**
 * The rider's conversation list, each with its latest message and unread count.
 *
 * Unread counts are computed in one grouped query rather than per conversation, so
 * this stays a fixed number of round trips regardless of list length.
 */
async function listForUser(userId) {
  const memberships = await ConversationMember.findAll({
    where: { userId },
    include: [
      {
        model: Conversation,
        as: 'conversation',
        required: true,
        include: [{ model: Community, as: 'community' }],
      },
    ],
  });

  if (!memberships.length) return [];

  const conversationIds = memberships.map((membership) => membership.conversationId);

  // Counterparties for direct threads.
  const otherMembers = await ConversationMember.findAll({
    where: { conversationId: { [Op.in]: conversationIds }, userId: { [Op.ne]: userId } },
    include: [{ model: User, as: 'user' }],
  });
  const participantsByConversation = new Map();
  otherMembers.forEach((member) => {
    const list = participantsByConversation.get(member.conversationId) || [];
    if (member.user) list.push(member.user.toPublicJSON());
    participantsByConversation.set(member.conversationId, list);
  });

  // Latest message per conversation. DISTINCT ON is the cheap Postgres idiom for
  // "one row per group" and is satisfied by the (conversation_id, created_at) index.
  const latestRows = await sequelize.query(
    `SELECT DISTINCT ON (m.conversation_id)
            m.conversation_id, m.id, m.content, m.sender_id, m.created_at
       FROM messages m
      WHERE m.conversation_id IN (:conversationIds)
        AND m.deleted_at IS NULL
      ORDER BY m.conversation_id, m.created_at DESC`,
    { replacements: { conversationIds }, type: QueryTypes.SELECT },
  );
  const latestByConversation = new Map(latestRows.map((row) => [row.conversation_id, row]));

  // Unread counts for every conversation in one grouped query. Doing this per
  // conversation would put the list endpoint's cost in step with its length.
  const unreadRows = await sequelize.query(
    `SELECT m.conversation_id, COUNT(*)::int AS unread
       FROM messages m
       JOIN conversation_members cm
         ON cm.conversation_id = m.conversation_id
        AND cm.user_id = :userId
      WHERE m.conversation_id IN (:conversationIds)
        AND m.sender_id <> :userId
        AND m.deleted_at IS NULL
        AND (cm.last_read_at IS NULL OR m.created_at > cm.last_read_at)
      GROUP BY m.conversation_id`,
    { replacements: { conversationIds, userId }, type: QueryTypes.SELECT },
  );
  const unreadByConversation = new Map(
    unreadRows.map((row) => [row.conversation_id, Number(row.unread)]),
  );

  const items = memberships.map((membership) => {
    const conversation = membership.conversation;
    const latest = latestByConversation.get(conversation.id);
    const participants = participantsByConversation.get(conversation.id) || [];

    return {
      id: conversation.id,
      type: conversation.type,
      communityId: conversation.communityId,
      community: conversation.community
        ? {
            id: conversation.community.id,
            name: conversation.community.name,
            slug: conversation.community.slug,
            image: conversation.community.image,
          }
        : null,
      participants,
      title:
        conversation.type === 'community'
          ? conversation.community?.name ?? 'Community'
          : participants[0]?.displayName ?? 'Direct message',
      lastMessage: latest
        ? {
            id: latest.id,
            content: latest.content,
            senderId: latest.sender_id,
            createdAt: latest.created_at,
          }
        : null,
      lastMessageAt: conversation.lastMessageAt,
      unreadCount: unreadByConversation.get(conversation.id) || 0,
      lastReadAt: membership.lastReadAt,
    };
  });

  // Most recently active first; threads with no messages fall back to creation.
  items.sort((a, b) => {
    const left = new Date(a.lastMessageAt || 0).getTime();
    const right = new Date(b.lastMessageAt || 0).getTime();
    return right - left;
  });

  return items;
}

async function markRead(conversationId, userId) {
  const { membership } = await assertAccess(conversationId, userId);
  await membership.update({ lastReadAt: new Date() });
  return { lastReadAt: membership.lastReadAt };
}

/** Every member id — used to fan notifications out to a thread. */
async function memberIds(conversationId) {
  const rows = await ConversationMember.findAll({
    where: { conversationId },
    attributes: ['userId'],
  });
  return rows.map((row) => row.userId);
}

module.exports = {
  assertAccess,
  canAccess,
  getOrCreateDirect,
  getCommunityConversation,
  listForUser,
  markRead,
  memberIds,
};
