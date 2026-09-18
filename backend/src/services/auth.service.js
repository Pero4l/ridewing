'use strict';

/**
 * Registration, sign-in and password changes.
 *
 * Sign-in deliberately gives identical responses for "no such account" and "wrong
 * password", and always performs a bcrypt comparison even when the account does
 * not exist, so response timing does not reveal which usernames are registered.
 */

const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { Op } = require('sequelize');

const env = require('../config/env');
const { User, sequelize } = require('../models');
const ApiError = require('../utils/ApiError');
const tokenService = require('./token.service');

// A bcrypt hash of random bytes, computed once at boot. Compared against when an
// account is not found so the work-factor cost is paid on every login attempt,
// whether or not the account exists. Nothing a client can send will ever match it.
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), env.auth.bcryptRounds);

/** Constant-time comparison so a wrong admin token does not leak timing. */
function secretsMatch(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

const normalizeEmail = (value) => (value ? String(value).trim().toLowerCase() : null);
const normalizeUsername = (value) => (value ? String(value).trim().toLowerCase() : null);
const normalizePhone = (value) => (value ? String(value).replace(/[\s()-]/g, '') : null);

async function hashPassword(plain) {
  return bcrypt.hash(plain, env.auth.bcryptRounds);
}

/**
 * Creates an account. Uniqueness is enforced by database constraints — we do not
 * pre-check with a SELECT, which would race under concurrent signups.
 */
async function register({ username, email, phone, password, displayName, bio, bikeInfo }, { userAgent } = {}, options = {}) {
  const passwordHash = await hashPassword(password);

  const result = await sequelize.transaction(async (transaction) => {
    const user = await User.create(
      {
        username: normalizeUsername(username),
        email: normalizeEmail(email),
        phone: normalizePhone(phone),
        passwordHash,
        displayName: String(displayName || username).trim(),
        bio: bio ?? null,
        bikeInfo: bikeInfo ?? {},
        ...(options.role ? { role: options.role } : {}),
      },
      { transaction },
    );

    const { rawToken } = await tokenService.issueRefreshToken(user.id, { userAgent, transaction });
    return { user, refreshToken: rawToken };
  });

  return {
    user: result.user,
    accessToken: tokenService.signAccessToken(result.user),
    refreshToken: result.refreshToken,
  };
}

/** Looks up an account by username, email or phone in a single query. */
async function findByIdentifier(identifier) {
  const value = String(identifier).trim();
  return User.scope('withPassword').findOne({
    where: {
      [Op.or]: [
        { username: value.toLowerCase() },
        { email: value.toLowerCase() },
        { phone: normalizePhone(value) },
      ],
    },
  });
}

async function login({ identifier, password }, { userAgent } = {}) {
  const user = await findByIdentifier(identifier);

  // Always run a comparison so timing does not distinguish the two failure modes.
  const matches = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);

  if (!user || !matches) {
    throw ApiError.unauthorized('Incorrect credentials', { code: 'INVALID_CREDENTIALS' });
  }

  const { rawToken } = await tokenService.issueRefreshToken(user.id, { userAgent });
  await user.update({ lastSeenAt: new Date() });

  return {
    user,
    accessToken: tokenService.signAccessToken(user),
    refreshToken: rawToken,
  };
}

/** Rotates the refresh cookie and mints a matching access token. */
async function refresh(rawRefreshToken, { userAgent } = {}) {
  const { userId, rawToken } = await tokenService.rotateRefreshToken(rawRefreshToken, { userAgent });

  const user = await User.findByPk(userId);
  if (!user) throw ApiError.unauthorized('Account no longer exists');

  return { user, accessToken: tokenService.signAccessToken(user), refreshToken: rawToken };
}

async function logout(rawRefreshToken) {
  await tokenService.revokeRefreshToken(rawRefreshToken);
}

/**
 * Changes a password and invalidates every existing session, so a stolen
 * refresh cookie stops working the moment the owner rotates their password.
 */
async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await User.scope('withPassword').findByPk(userId);
  if (!user) throw ApiError.notFound('Account not found');

  const matches = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!matches) throw ApiError.unauthorized('Current password is incorrect');

  if (await bcrypt.compare(newPassword, user.passwordHash)) {
    throw ApiError.badRequest('New password must be different from the current one');
  }

  const passwordHash = await hashPassword(newPassword);

  await sequelize.transaction(async (transaction) => {
    await user.update({ passwordHash }, { transaction });
    await tokenService.revokeAllForUser(user.id, { transaction });
  });
}

/** Creates an admin account. Only succeeds when the caller presents a token that
 * matches the ADMIN_REGISTER_TOKEN secret and the token is configured at all —
 * otherwise we 404 so the endpoint is indistinguishable from a missing route. */
async function registerAdmin(payload, { adminToken, userAgent } = {}) {
  if (!env.admin.registerToken || !adminToken) {
    throw ApiError.notFound('Not found');
  }
  if (!secretsMatch(adminToken, env.admin.registerToken)) {
    throw ApiError.unauthorized('Invalid admin registration token');
  }
  return register(payload, { userAgent }, { role: 'admin' });
}

module.exports = {
  register,
  registerAdmin,
  login,
  refresh,
  logout,
  changePassword,
  hashPassword,
  findByIdentifier,
  normalizeEmail,
  normalizeUsername,
  normalizePhone,
};
