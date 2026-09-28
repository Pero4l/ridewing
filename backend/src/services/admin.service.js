'use strict';

/**
 * Administrative functions that operate across accounts.
 *
 * Admins have a job to do: help riders and keep the platform safe. The service
 * concentrates that work in one place so routes stay thin, validators protect
 * inputs, and the handful of dangerous decisions (e.g. "am I the last admin?")
 * are made explicitly with transactions.
 */

const { Op } = require('sequelize');

const { User, RideSession, Post, AdminActivityLog, sequelize } = require('../models');
const ApiError = require('../utils/ApiError');
const tokenService = require('./token.service');

/**
 * Records who did what, in the same transaction as the action itself.
 *
 * Passing the transaction is the point: if the role change rolls back, the log
 * entry rolls back with it, so the log can never claim an action that did not
 * happen. It is written after the mutation rather than before, so a rejected
 * action leaves no trace of the attempt.
 */
async function log(admin, action, target, metadata, transaction) {
  await AdminActivityLog.create(
    {
      adminId: admin.id,
      adminUsername: admin.username,
      action,
      targetId: target?.id ?? null,
      targetUsername: target?.username ?? null,
      metadata: metadata ?? {},
    },
    { transaction },
  );
}

/** Recent admin activity, newest first. Powers the console's activity tab. */
async function listActivity({ limit, page } = {}) {
  const take = Number.isFinite(Number(limit)) ? Math.min(Math.max(1, Number(limit)), 100) : 50;
  const currentPage = Number.isFinite(Number(page)) ? Math.max(1, Number(page)) : 1;

  const { rows, count } = await AdminActivityLog.findAndCountAll({
    order: [['createdAt', 'DESC']],
    limit: take,
    offset: (currentPage - 1) * take,
  });

  return {
    activity: rows.map((row) => row.toJSON()),
    total: count,
    page: currentPage,
    pages: Math.ceil(count / take) || 1,
  };
}

function normalizeQuery(query = {}) {
  const limit = Number.isFinite(Number(query.limit)) ? Number(query.limit) : 20;
  const page = Number.isFinite(Number(query.page)) ? Number(query.page) : 1;
  return {
    status: query.status,
    role: query.role,
    q: query.q,
    limit: Math.min(Math.max(1, limit), 100),
    page: Math.max(1, page),
  };
}

async function listUsers(rawQuery = {}) {
  const { status, role, q, limit, page } = normalizeQuery(rawQuery);
  const where = {};

  if (status === 'active' || status === 'suspended') {
    where.status = status;
  }
  if (role === 'rider' || role === 'admin') {
    where.role = role;
  }
  if (q) {
    const term = String(q).trim().toLowerCase();
    where[Op.or] = [
      { username: { [Op.iLike]: `%${term}%` } },
      { displayName: { [Op.iLike]: `%${term}%` } },
      { email: { [Op.iLike]: `%${term}%` } },
    ];
  }

  const offset = (page - 1) * limit;
  // Sequelize 6's findAndCountAll resolves to { rows, count }, not the array that
  // v7 returns — destructure the object or `rows` silently becomes undefined.
  const { rows, count } = await User.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });

  return {
    users: rows.map((u) => u.toPrivateJSON()),
    total: count,
    page,
    pages: Math.ceil(count / limit) || 1,
  };
}

async function getUser(userId) {
  const user = await User.findByPk(userId);
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

async function getStats() {
  const [usersTotal, usersActive, usersSuspended, ridesActive, postsTotal] = await Promise.all([
    User.count(),
    User.count({ where: { status: 'active' } }),
    User.count({ where: { status: 'suspended' } }),
    RideSession.count({ where: { status: 'active' } }),
    Post.count(),
  ]);
  return { usersTotal, usersActive, usersSuspended, ridesActive, postsTotal };
}

async function changeRole(admin, targetUserId, { role }) {
  const adminId = admin.id;
  if (adminId === targetUserId) {
    throw ApiError.badRequest('You cannot change your own role');
  }
  if (role !== 'rider' && role !== 'admin') {
    throw ApiError.badRequest('Invalid role');
  }

  return sequelize.transaction(async (transaction) => {
    const target = await User.findByPk(targetUserId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!target) throw ApiError.notFound('User not found');

    // Defence in depth for the last admin. The self-target check above is the
    // gate that actually fires: this function is only ever reached by an admin
    // (the route requires it), and since actor and target must differ, a target
    // that is an admin implies at least two admins exist. So the count can
    // never be 1 here. It stays because it is cheap and because it keeps the
    // invariant local to the function that would break it — if this service is
    // ever called from somewhere that is not route-guarded, the rule still
    // holds rather than silently depending on a caller three files away.
    if (target.role === 'admin' && role === 'rider') {
      const adminCount = await User.count({ where: { role: 'admin' }, transaction });
      if (adminCount <= 1) {
        throw ApiError.badRequest('Cannot demote the last admin');
      }
    }

    const previousRole = target.role;
    await target.update({ role }, { transaction });
    await log(admin, 'user.role_changed', target, { from: previousRole, to: role }, transaction);
    return target.toPrivateJSON();
  });
}

async function suspendUser(admin, targetUserId, { reason } = {}) {
  const adminId = admin.id;
  if (adminId === targetUserId) {
    throw ApiError.badRequest('You cannot suspend your own account');
  }
  const r = reason ? String(reason).trim() : '';
  if (r.length > 500) {
    throw ApiError.badRequest('Reason must be at most 500 characters');
  }

  return sequelize.transaction(async (transaction) => {
    const target = await User.findByPk(targetUserId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!target) throw ApiError.notFound('User not found');
    if (target.status === 'suspended') return target.toPrivateJSON();

    // Same reasoning as changeRole: unreachable while the self-target check
    // holds, kept so suspending staff can never remove the final admin.
    if (target.role === 'admin') {
      const adminCount = await User.count({ where: { role: 'admin' }, transaction });
      if (adminCount <= 1) {
        throw ApiError.badRequest('Cannot suspend the last admin');
      }
    }

    await target.update(
      {
        status: 'suspended',
        suspendedAt: new Date(),
        suspensionReason: r || null,
        suspendedBy: adminId,
      },
      { transaction },
    );

    // Invalidate all active sessions immediately so a suspended rider cannot
    // continue using an access token that exists in another tab.
    await tokenService.revokeAllForUser(target.id, { transaction });
    await log(admin, 'user.suspended', target, { reason: r || null }, transaction);
    return target.toPrivateJSON();
  });
}

async function unsuspendUser(admin, targetUserId) {
  const adminId = admin.id;
  if (adminId === targetUserId) {
    throw ApiError.badRequest('You cannot unsuspend your own account');
  }

  return sequelize.transaction(async (transaction) => {
    const target = await User.findByPk(targetUserId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!target) throw ApiError.notFound('User not found');
    if (target.status === 'active') return target.toPrivateJSON();

    // Captured first: `update` mutates the instance in place, so reading the
    // reason afterwards would always yield the cleared null.
    const previousReason = target.suspensionReason;

    await target.update(
      {
        status: 'active',
        suspendedAt: null,
        suspensionReason: null,
        suspendedBy: null,
      },
      { transaction },
    );
    await log(admin, 'user.unsuspended', target, { previousReason }, transaction);
    return target.toPrivateJSON();
  });
}

async function revokeSessions(admin, targetUserId) {
  const adminId = admin.id;
  if (adminId === targetUserId) {
    throw ApiError.badRequest('You cannot revoke your own sessions via this action');
  }
  const target = await User.findByPk(targetUserId);
  if (!target) throw ApiError.notFound('User not found');
  // Not wrapped in a transaction: the revocation *is* the action, and there is
  // no row here that has to move in step with it. Logging outside keeps a
  // failure in the log from rolling back a revocation that already succeeded.
  await tokenService.revokeAllForUser(target.id);
  await log(admin, 'user.sessions_revoked', target, {});
  return { ok: true };
}

module.exports = {
  listUsers,
  getUser,
  getStats,
  listActivity,
  changeRole,
  suspendUser,
  unsuspendUser,
  revokeSessions,
};
