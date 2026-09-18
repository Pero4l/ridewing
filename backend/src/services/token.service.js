'use strict';

/**
 * Token issuance and rotation.
 *
 * Access tokens are short-lived JWTs held in memory by the client. Refresh tokens
 * are opaque 48-byte random strings delivered in an httpOnly cookie; only their
 * SHA-256 hash is stored, and each use rotates them. Presenting an already-rotated
 * token normally means it leaked — except when two tabs race a rotation with the
 * same cookie, which is a legit case. A same-browser replay walks the replacement
 * chain forward to the live token; a replay from a different browser agent is
 * treated as theft and revokes the entire family.
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');

const env = require('../config/env');
const logger = require('../config/logger');
const { RefreshToken, sequelize } = require('../models');
const ApiError = require('../utils/ApiError');

const ISSUER = 'ridewing';
const AUDIENCE = 'ridewing-app';

/** SHA-256 is appropriate here: the input is 48 bytes of CSPRNG output, not a password. */
function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function signAccessToken(user) {
  return jwt.sign({ sub: user.id, username: user.username }, env.auth.accessSecret, {
    expiresIn: env.auth.accessTokenTtl,
    issuer: ISSUER,
    audience: AUDIENCE,
  });
}

/** Throws on any invalid/expired/mis-scoped token. Never returns a partial result. */
function verifyAccessToken(token) {
  const payload = jwt.verify(token, env.auth.accessSecret, {
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  if (!payload?.sub) throw ApiError.unauthorized('Malformed token');
  return payload;
}

function refreshExpiry() {
  return new Date(Date.now() + env.auth.refreshTokenTtlDays * 24 * 60 * 60 * 1000);
}

async function issueRefreshToken(userId, { userAgent, transaction } = {}) {
  const rawToken = crypto.randomBytes(48).toString('base64url');
  const record = await RefreshToken.create(
    {
      userId,
      tokenHash: hashToken(rawToken),
      expiresAt: refreshExpiry(),
      userAgent: userAgent ? String(userAgent).slice(0, 255) : null,
    },
    { transaction },
  );
  return { rawToken, record };
}

async function findActive(rawToken) {
  if (!rawToken) return null;
  const record = await RefreshToken.findOne({ where: { tokenHash: hashToken(rawToken) } });
  return record;
}

/**
 * Exchanges a refresh token for a fresh pair.
 *
 * Runs in a transaction with a row lock so two concurrent refreshes from the same
 * tab cannot both succeed and orphan a token.
 */
async function rotateRefreshToken(rawToken, { userAgent } = {}) {
  if (!rawToken) throw ApiError.unauthorized('Refresh token missing');

  return sequelize.transaction(async (transaction) => {
    let cursor = await RefreshToken.findOne({
      where: { tokenHash: hashToken(rawToken) },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });

    if (!cursor) throw ApiError.unauthorized('Refresh token is not recognised');

    // A revoked token means it was already rotated. Parallel tabs presenting the
    // same cookie mid-rotation is a legitimate race — follow the replacement
    // chain forward (bounded) to the live token and rotate it, so a reload + tab
    // restore storm converges instead of ending every session. A replay from a
    // different browser agent means the cookie left this browser: an active theft
    // — revoke the whole family.
    let hops = 0;
    while (cursor.revokedAt) {
      if (hops >= 8) {
        logger.warn({ userId: cursor.userId }, 'refresh token chain too deep — revoking family');
        await RefreshToken.update(
          { revokedAt: new Date() },
          { where: { userId: cursor.userId, revokedAt: null }, transaction },
        );
        throw ApiError.unauthorized('Session revoked, please sign in again');
      }

      const selfUserAgent = String(userAgent ?? '').slice(0, 255);
      const issuerUserAgent = cursor.userAgent ? String(cursor.userAgent).slice(0, 255) : null;
      const sameBrowser = !issuerUserAgent || !selfUserAgent || issuerUserAgent === selfUserAgent;

      if (!sameBrowser) {
        logger.warn({ userId: cursor.userId }, 'refresh token reuse from a different browser — revoking family');
        await RefreshToken.update(
          { revokedAt: new Date() },
          { where: { userId: cursor.userId, revokedAt: null }, transaction },
        );
        throw ApiError.unauthorized('Session revoked, please sign in again');
      }

      cursor = cursor.replacedByTokenId
        ? await RefreshToken.findByPk(cursor.replacedByTokenId, {
            lock: transaction.LOCK.UPDATE,
            transaction,
          })
        : null;

      if (!cursor) {
        throw ApiError.unauthorized('Session revoked, please sign in again');
      }
      hops += 1;
    }

    if (cursor.expiresAt.getTime() <= Date.now()) {
      throw ApiError.unauthorized('Session expired, please sign in again');
    }

    const { rawToken: nextRaw, record: nextRecord } = await issueRefreshToken(cursor.userId, {
      userAgent,
      transaction,
    });

    await cursor.update(
      { revokedAt: new Date(), replacedByTokenId: nextRecord.id },
      { transaction },
    );

    return { userId: cursor.userId, rawToken: nextRaw };
  });
}

async function revokeRefreshToken(rawToken) {
  const record = await findActive(rawToken);
  if (record && !record.revokedAt) await record.update({ revokedAt: new Date() });
}

async function revokeAllForUser(userId, { transaction } = {}) {
  await RefreshToken.update(
    { revokedAt: new Date() },
    { where: { userId, revokedAt: null }, transaction },
  );
}

/** Housekeeping: drop rows that can no longer authenticate anything. */
async function purgeExpired() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return RefreshToken.destroy({
    where: {
      [Op.or]: [{ expiresAt: { [Op.lt]: new Date() } }, { revokedAt: { [Op.lt]: cutoff } }],
    },
  });
}

module.exports = {
  hashToken,
  signAccessToken,
  verifyAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllForUser,
  purgeExpired,
};
