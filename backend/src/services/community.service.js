'use strict';

/**
 * Communities: creation, membership, roles and join requests.
 *
 * Authorization lives here, not in the routes, and every check reads the role from
 * `community_members` — a client-supplied role is never trusted. Membership changes
 * run in transactions alongside the denormalized counters and the community
 * conversation roster so those three can never disagree.
 */

const { Op } = require('sequelize');

const {
  Community,
  CommunityMember,
  CommunityFollow,
  CommunityJoinRequest,
  Conversation,
  ConversationMember,
  User,
  sequelize,
} = require('../models');
const ApiError = require('../utils/ApiError');
const { uniqueSlug } = require('../utils/slug');
const { normalizeLimit, decodeCursor, buildPage } = require('../utils/pagination');
const notificationService = require('./notification.service');
const emailService = require('./email.service');
const emailVerificationService = require('./emailVerification.service');

const RANK = { owner: 3, admin: 2, moderator: 1, member: 0 };

/** True when `role` is at least as privileged as `minimum`. */
function satisfies(role, minimum) {
  if (!role) return false;
  return RANK[role] >= RANK[minimum];
}

async function getBySlugOrThrow(slug, options = {}) {
  const community = await Community.findOne({
    where: { slug: String(slug).toLowerCase() },
    include: [{ model: User, as: 'owner' }],
    ...options,
  });
  if (!community) throw ApiError.notFound('Community not found');
  return community;
}

async function getByIdOrThrow(communityId, options = {}) {
  const community = await Community.findByPk(communityId, options);
  if (!community) throw ApiError.notFound('Community not found');
  return community;
}

/** Returns the viewer's active membership row, or null. */
async function getMembership(communityId, userId, options = {}) {
  if (!userId) return null;
  return CommunityMember.findOne({ where: { communityId, userId }, ...options });
}

/**
 * The single authorization gate for community actions.
 * Throws 403 unless the actor holds at least `minimum` role and is not banned.
 */
async function requireRole(communityId, userId, minimum, options = {}) {
  const membership = await getMembership(communityId, userId, options);

  if (!membership || membership.status !== 'active') {
    throw ApiError.forbidden('You are not a member of this community');
  }
  if (!satisfies(membership.role, minimum)) {
    throw ApiError.forbidden('Your role does not allow that action');
  }
  return membership;
}

/** Membership is what grants chat access; following alone does not. */
async function requireActiveMember(communityId, userId, options = {}) {
  return requireRole(communityId, userId, 'member', options);
}

async function create(ownerId, { name, bio, image, joinPolicy }) {
  const slug = await uniqueSlug(name, async (candidate) => {
    const existing = await Community.findOne({ where: { slug: candidate }, attributes: ['id'] });
    return Boolean(existing);
  });

  const community = await sequelize.transaction(async (transaction) => {
    const created = await Community.create(
      {
        name: String(name).trim(),
        slug,
        bio: bio ?? null,
        image: image ?? null,
        ownerId,
        joinPolicy: joinPolicy || 'request',
        memberCount: 1,
        followerCount: 0,
      },
      { transaction },
    );

    await CommunityMember.create(
      { communityId: created.id, userId: ownerId, role: 'owner', status: 'active' },
      { transaction },
    );

    // Every community owns exactly one chat thread, created up front so there is
    // no "first message creates the room" special case.
    const conversation = await Conversation.create(
      { type: 'community', communityId: created.id },
      { transaction },
    );
    await ConversationMember.create(
      { conversationId: conversation.id, userId: ownerId },
      { transaction },
    );

created.owner = await User.findByPk(ownerId, { transaction });
    return created;
  });

  // Fire-and-forget so mail relay problems never roll back a community creation.
  emailService.alertAdmins({
    subject: `RideWing: new community created (${community.name})`,
    text: `A new community was created: ${community.name} (slug ${community.slug}).`,
    html: emailService.renderHtml({
      title: 'New community created',
      paragraphs: [
        `Name: ${community.name}`,
        `Owner: ${community.owner?.displayName ?? ownerId}`,
        `Slug: ${community.slug}`,
      ],
    }),
  });

  return community;
}

async function update(communityId, actorId, payload) {
  await requireRole(communityId, actorId, 'admin');
  const community = await getByIdOrThrow(communityId);

  const patch = {};
  ['name', 'bio', 'image', 'joinPolicy'].forEach((field) => {
    if (payload[field] !== undefined) patch[field] = payload[field];
  });
  if (!Object.keys(patch).length) throw ApiError.badRequest('No changes supplied');

  await community.update(patch);
  return community;
}

/** Viewer-specific flags for a community detail view. */
async function viewerContext(communityId, viewerId) {
  if (!viewerId) return {};

  const [membership, following, pendingRequest] = await Promise.all([
    getMembership(communityId, viewerId),
    CommunityFollow.findOne({ where: { communityId, userId: viewerId }, attributes: ['id'] }),
    CommunityJoinRequest.findOne({
      where: { communityId, userId: viewerId, status: 'pending' },
      attributes: ['id', 'status'],
    }),
  ]);

  return {
    role: membership?.status === 'active' ? membership.role : null,
    status: membership?.status ?? null,
    isFollowing: Boolean(following),
    joinRequestStatus: pendingRequest ? 'pending' : null,
  };
}

async function getDetail(slug, viewerId) {
  const community = await getBySlugOrThrow(slug);
  const context = await viewerContext(community.id, viewerId);
  return community.toJSONFor(context);
}

/** Directory listing with optional text search. */
async function list({ search, limit, cursor } = {}) {
  const pageSize = normalizeLimit(limit);
  const decoded = decodeCursor(cursor);

  const where = {};
  if (search && String(search).trim().length >= 2) {
    const pattern = `${String(search).trim().replace(/[%_\\]/g, '\\$&')}%`;
    where[Op.or] = [{ name: { [Op.iLike]: pattern } }, { slug: { [Op.iLike]: pattern } }];
  }
  if (decoded?.createdAt) where.createdAt = { [Op.lt]: new Date(decoded.createdAt) };

  const rows = await Community.findAll({
    where,
    include: [{ model: User, as: 'owner' }],
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    limit: pageSize + 1,
  });

  const page = buildPage(rows, pageSize, (row) => ({ createdAt: row.createdAt.toISOString() }));
  return { items: page.items.map((row) => row.toJSONFor({})), pageInfo: page.pageInfo };
}

/** Communities the rider belongs to, for their sidebar. */
async function listMine(userId) {
  const memberships = await CommunityMember.findAll({
    where: { userId, status: 'active' },
    include: [
      { model: Community, as: 'community', include: [{ model: User, as: 'owner' }] },
    ],
    order: [['joinedAt', 'DESC']],
  });

  return memberships
    .filter((membership) => membership.community)
    .map((membership) => membership.community.toJSONFor({ role: membership.role, status: membership.status }));
}

/**
 * Joins an open community outright, or files a request on a gated one.
 * Re-joining after leaving reactivates the existing row; bans are not reversible
 * by the banned rider.
 */
async function join(slug, userId, message) {
  const community = await getBySlugOrThrow(slug);

  // Verified-riders gate: joining communities is for humans, not spam boxes.
  if (emailVerificationService.isEnabled()) {
    const member = await User.findByPk(userId, { attributes: ['id', 'emailVerifiedAt', 'email'] });
    if (
      member &&
      emailVerificationService.hasVerifiableEmail(member) &&
      !member.emailVerifiedAt
    ) {
      throw ApiError.forbidden(
        'Verify your email address before joining a community',
        { code: 'EMAIL_UNVERIFIED' },
      );
    }
  }

  return sequelize.transaction(async (transaction) => {
    const existing = await CommunityMember.findOne({
      where: { communityId: community.id, userId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (existing?.status === 'banned') {
      throw ApiError.forbidden('You are banned from this community');
    }
    if (existing?.status === 'active') {
      return { state: 'member', role: existing.role };
    }

    if (community.joinPolicy === 'request') {
      const [request, created] = await CommunityJoinRequest.findOrCreate({
        where: { communityId: community.id, userId, status: 'pending' },
        defaults: {
          communityId: community.id,
          userId,
          status: 'pending',
          message: message ?? null,
        },
        transaction,
      });

      if (created) {
        // Notify everyone who can act on the request.
        const reviewers = await CommunityMember.findAll({
          where: {
            communityId: community.id,
            status: 'active',
            role: { [Op.in]: ['owner', 'admin', 'moderator'] },
          },
          attributes: ['userId'],
          transaction,
        });

        transaction.afterCommit(() =>
          notificationService.createMany(
            reviewers.map((reviewer) => reviewer.userId),
            {
              actorId: userId,
              type: 'community_join_request',
              entityType: 'community',
              entityId: community.id,
              data: { communitySlug: community.slug, requestId: request.id },
            },
          ),
        );
      }

      return { state: 'requested', requestId: request.id };
    }

    await admitMember(community, userId, { transaction, existing });
    return { state: 'member', role: 'member' };
  });
}

/**
 * Adds a rider to a community: membership row, counter and chat roster together.
 * Callers must supply the surrounding transaction.
 */
async function admitMember(community, userId, { transaction, existing = null, role = 'member' }) {
  if (existing) {
    await existing.update({ status: 'active', role, joinedAt: new Date() }, { transaction });
  } else {
    await CommunityMember.create(
      { communityId: community.id, userId, role, status: 'active' },
      { transaction },
    );
  }

  await community.increment('memberCount', { by: 1, transaction });

  const conversation = await Conversation.findOne({
    where: { communityId: community.id },
    transaction,
  });
  if (conversation) {
    await ConversationMember.findOrCreate({
      where: { conversationId: conversation.id, userId },
      defaults: { conversationId: conversation.id, userId },
      transaction,
    });
  }
}

async function listJoinRequests(slug, actorId, { status = 'pending' } = {}) {
  const community = await getBySlugOrThrow(slug);
  await requireRole(community.id, actorId, 'moderator');

  const requests = await CommunityJoinRequest.findAll({
    where: { communityId: community.id, status },
    include: [{ model: User, as: 'user' }],
    order: [['createdAt', 'ASC']],
    limit: 200,
  });

  return requests.map((request) => ({
    id: request.id,
    status: request.status,
    message: request.message,
    createdAt: request.createdAt,
    user: request.user ? request.user.toPublicJSON() : null,
  }));
}

/** Approves or rejects a pending request. Moderator and above. */
async function reviewJoinRequest(slug, actorId, requestId, decision) {
  if (!['approved', 'rejected'].includes(decision)) {
    throw ApiError.badRequest('Decision must be "approved" or "rejected"');
  }

  const community = await getBySlugOrThrow(slug);
  await requireRole(community.id, actorId, 'moderator');

  return sequelize.transaction(async (transaction) => {
    const request = await CommunityJoinRequest.findOne({
      where: { id: requestId, communityId: community.id },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!request) throw ApiError.notFound('Join request not found');
    if (request.status !== 'pending') {
      throw ApiError.conflict('That request has already been reviewed');
    }

    await request.update(
      { status: decision, reviewedBy: actorId, reviewedAt: new Date() },
      { transaction },
    );

    if (decision === 'approved') {
      const locked = await Community.findByPk(community.id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      const existing = await CommunityMember.findOne({
        where: { communityId: community.id, userId: request.userId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (existing?.status === 'banned') throw ApiError.forbidden('That rider is banned');
      if (existing?.status !== 'active') {
        await admitMember(locked, request.userId, { transaction, existing });
      }
    }

    transaction.afterCommit(() =>
      notificationService.create({
        userId: request.userId,
        actorId,
        type: decision === 'approved' ? 'community_join_approved' : 'community_join_rejected',
        entityType: 'community',
        entityId: community.id,
        data: { communitySlug: community.slug, communityName: community.name },
      }),
    );

    return { id: request.id, status: decision };
  });
}

async function cancelJoinRequest(slug, userId) {
  const community = await getBySlugOrThrow(slug);
  const [updated] = await CommunityJoinRequest.update(
    { status: 'cancelled', reviewedAt: new Date() },
    { where: { communityId: community.id, userId, status: 'pending' } },
  );
  if (!updated) throw ApiError.notFound('No pending request to cancel');
  return { cancelled: true };
}

/** Leaving requires transferring ownership first, so a community is never orphaned. */
async function leave(slug, userId) {
  const community = await getBySlugOrThrow(slug);

  return sequelize.transaction(async (transaction) => {
    const locked = await Community.findByPk(community.id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const membership = await CommunityMember.findOne({
      where: { communityId: community.id, userId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!membership || membership.status !== 'active') {
      throw ApiError.badRequest('You are not a member of this community');
    }
    if (membership.role === 'owner') {
      throw ApiError.badRequest('Transfer ownership before leaving this community');
    }

    await membership.update({ status: 'left' }, { transaction });
    await locked.decrement('memberCount', { by: 1, transaction });

    const conversation = await Conversation.findOne({
      where: { communityId: community.id },
      transaction,
    });
    if (conversation) {
      await ConversationMember.destroy({
        where: { conversationId: conversation.id, userId },
        transaction,
      });
    }

    return { left: true };
  });
}

/**
 * Changes a member's role.
 *
 * Two rules keep the hierarchy sound: you may never grant a role at or above your
 * own, and you may never act on somebody who outranks you. Ownership moves only
 * through `transferOwnership`.
 */
async function setMemberRole(slug, actorId, targetUsername, role) {
  if (!['admin', 'moderator', 'member'].includes(role)) {
    throw ApiError.badRequest('Role must be admin, moderator or member');
  }

  const community = await getBySlugOrThrow(slug);
  const actor = await requireRole(community.id, actorId, 'admin');

  const target = await User.findOne({ where: { username: String(targetUsername).toLowerCase() } });
  if (!target) throw ApiError.notFound('Rider not found');
  if (target.id === actorId) throw ApiError.badRequest('You cannot change your own role');

  const membership = await getMembership(community.id, target.id);
  if (!membership || membership.status !== 'active') {
    throw ApiError.notFound('That rider is not a member of this community');
  }
  if (membership.role === 'owner') throw ApiError.forbidden('The owner role cannot be changed here');

  if (RANK[membership.role] >= RANK[actor.role]) {
    throw ApiError.forbidden('You cannot modify a member at or above your own role');
  }
  if (RANK[role] >= RANK[actor.role]) {
    throw ApiError.forbidden('You cannot grant a role at or above your own');
  }

  await membership.update({ role });

  await notificationService.create({
    userId: target.id,
    actorId,
    type: 'community_role_changed',
    entityType: 'community',
    entityId: community.id,
    data: { communitySlug: community.slug, role },
  });

  return { userId: target.id, role };
}

/** Removes or bans a member. Moderator and above, and never someone who outranks you. */
async function removeMember(slug, actorId, targetUsername, { ban = false } = {}) {
  const community = await getBySlugOrThrow(slug);
  const actor = await requireRole(community.id, actorId, 'moderator');

  const target = await User.findOne({ where: { username: String(targetUsername).toLowerCase() } });
  if (!target) throw ApiError.notFound('Rider not found');
  if (target.id === actorId) throw ApiError.badRequest('Use "leave" to remove yourself');

  return sequelize.transaction(async (transaction) => {
    const locked = await Community.findByPk(community.id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const membership = await CommunityMember.findOne({
      where: { communityId: community.id, userId: target.id },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!membership) throw ApiError.notFound('That rider is not a member of this community');
    if (RANK[membership.role] >= RANK[actor.role]) {
      throw ApiError.forbidden('You cannot remove a member at or above your own role');
    }

    const wasActive = membership.status === 'active';
    await membership.update({ status: ban ? 'banned' : 'left' }, { transaction });
    if (wasActive) await locked.decrement('memberCount', { by: 1, transaction });

    const conversation = await Conversation.findOne({
      where: { communityId: community.id },
      transaction,
    });
    if (conversation) {
      await ConversationMember.destroy({
        where: { conversationId: conversation.id, userId: target.id },
        transaction,
      });
    }

    return { userId: target.id, status: ban ? 'banned' : 'removed' };
  });
}

/** Hands the owner role to an existing member. Owner only. */
async function transferOwnership(slug, actorId, targetUsername) {
  const community = await getBySlugOrThrow(slug);
  await requireRole(community.id, actorId, 'owner');

  const target = await User.findOne({ where: { username: String(targetUsername).toLowerCase() } });
  if (!target) throw ApiError.notFound('Rider not found');
  if (target.id === actorId) throw ApiError.badRequest('You already own this community');

  return sequelize.transaction(async (transaction) => {
    const locked = await Community.findByPk(community.id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    const currentOwner = await CommunityMember.findOne({
      where: { communityId: community.id, userId: actorId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const nextOwner = await CommunityMember.findOne({
      where: { communityId: community.id, userId: target.id },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!nextOwner || nextOwner.status !== 'active') {
      throw ApiError.badRequest('The new owner must already be an active member');
    }

    // Step down first: a partial unique index allows only one owner row.
    await currentOwner.update({ role: 'admin' }, { transaction });
    await nextOwner.update({ role: 'owner' }, { transaction });
    await locked.update({ ownerId: target.id }, { transaction });

    return { ownerId: target.id };
  });
}

async function listMembers(slug, viewerId, { limit, cursor } = {}) {
  const community = await getBySlugOrThrow(slug);
  await requireActiveMember(community.id, viewerId);

  const pageSize = normalizeLimit(limit);
  const decoded = decodeCursor(cursor);

  const where = { communityId: community.id, status: 'active' };
  if (decoded?.joinedAt) where.joinedAt = { [Op.lt]: new Date(decoded.joinedAt) };

  const rows = await CommunityMember.findAll({
    where,
    include: [{ model: User, as: 'user', required: true }],
    order: [['joinedAt', 'DESC'], ['id', 'DESC']],
    limit: pageSize + 1,
  });

  const page = buildPage(rows, pageSize, (row) => ({ joinedAt: row.joinedAt.toISOString() }));
  return {
    items: page.items.map((row) => ({
      ...row.user.toPublicJSON(),
      role: row.role,
      joinedAt: row.joinedAt,
    })),
    pageInfo: page.pageInfo,
  };
}

async function setFollowing(slug, userId, following) {
  const community = await getBySlugOrThrow(slug);

  return sequelize.transaction(async (transaction) => {
    const locked = await Community.findByPk(community.id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (following) {
      const [, created] = await CommunityFollow.findOrCreate({
        where: { communityId: community.id, userId },
        defaults: { communityId: community.id, userId },
        transaction,
      });
      if (created) await locked.increment('followerCount', { by: 1, transaction });
    } else {
      const removed = await CommunityFollow.destroy({
        where: { communityId: community.id, userId },
        transaction,
      });
      if (removed) await locked.decrement('followerCount', { by: 1, transaction });
    }

    return { following };
  });
}

module.exports = {
  RANK,
  satisfies,
  create,
  update,
  getDetail,
  getBySlugOrThrow,
  getByIdOrThrow,
  getMembership,
  requireRole,
  requireActiveMember,
  viewerContext,
  list,
  listMine,
  join,
  listJoinRequests,
  reviewJoinRequest,
  cancelJoinRequest,
  leave,
  setMemberRole,
  removeMember,
  transferOwnership,
  listMembers,
  setFollowing,
};
