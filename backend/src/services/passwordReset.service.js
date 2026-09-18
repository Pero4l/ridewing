'use strict';

/**
 * Password reset by email.
 *
 * Raw tokens are random 32-byte values, hashed with SHA-256 before they touch the
 * database. Requesting a reset always answers `{ sent: true }` so the endpoint
 * cannot be used to enumerate registered addresses; a cooldown window silently
 * suppresses re-sends. Redeeming a token revokes every existing session.
 */

const crypto = require('crypto');
const bcrypt = require('bcrypt');

const env = require('../config/env');
const { User, PasswordResetToken, sequelize } = require('../models');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const emailService = require('./email.service');
const tokenService = require('./token.service');

const RESEND_COOLDOWN_MS = 60 * 1000;

function hash(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function generateRawToken() {
  return crypto.randomBytes(32).toString('base64url');
}

async function revokeOutstanding(userId) {
  await PasswordResetToken.update(
    { usedAt: new Date(), expiresAt: new Date(0) },
    { where: { userId, usedAt: null } },
  );
}

/**
 * Whether a reset email was recently sent for this account. Also used silently in
 * requestReset, so a cooldown reply never reveals that the address is registered.
 */
async function sentRecently(userId) {
  const last = await PasswordResetToken.findOne({
    where: { userId },
    order: [['createdAt', 'DESC']],
  });
  return Boolean(last && Date.now() - last.createdAt.getTime() < RESEND_COOLDOWN_MS);
}

async function requestReset({ email }) {
  const user = await User.findOne({ where: { email: String(email ?? '').trim().toLowerCase() } });

  // Deliberately indistinguishable from success: never confirm an email exists.
  if (!user || !emailService.enabled()) {
    return { sent: true };
  }
  if (await sentRecently(user.id)) {
    return { sent: true };
  }

  await revokeOutstanding(user.id);
  const rawToken = generateRawToken();
  const expiresAt = new Date(Date.now() + env.email.passwordResetTokenTtlMinutes * 60 * 1000);
  await PasswordResetToken.create({ userId: user.id, tokenHash: hash(rawToken), expiresAt });

  const resetUrl = new URL('/reset-password', env.frontendUrl);
  resetUrl.searchParams.set('token', rawToken);
  const ttlMinutes = env.email.passwordResetTokenTtlMinutes;

  try {
    await emailService.sendTransactional({
      to: user.email,
      subject: 'Reset your RideWing password',
      text:
        `Hi ${user.displayName},\n\n` +
        `We received a request to reset the password for your RideWing account. ` +
        `Open this link to choose a new one (valid for ${ttlMinutes} minutes, one time only):\n\n${resetUrl.toString()}\n\n` +
        `If you did not request this, you can ignore this email.\n`,
      html: emailService.renderHtml({
        title: 'Reset your password',
        preview: `Hi ${user.displayName},`,
        paragraphs: [
          'We received a request to reset the password for your RideWing account. Use the button below to choose a new one.',
          `This link is valid for ${ttlMinutes} minutes and can only be used once. If you did not request this, you can ignore this email.`,
        ],
        button: { href: resetUrl.toString(), label: 'Reset password' },
      }),
    });
  } catch (error) {
    await PasswordResetToken.destroy({ where: { userId: user.id } });
    throw error;
  }

  logger.info({ userId: user.id }, 'password reset emailed');
  return { sent: true };
}

async function resetPassword({ token, password }) {
  const record = await PasswordResetToken.findOne({ where: { tokenHash: hash(token) } });
  if (!record?.isUsable()) {
    throw ApiError.badRequest('This reset link is invalid or has expired');
  }

  const user = await User.findByPk(record.userId);
  if (!user) throw ApiError.notFound('Account not found');

  const newHash = await bcrypt.hash(password, env.auth.bcryptRounds);

  await sequelize.transaction(async (transaction) => {
    await user.update({ passwordHash: newHash }, { transaction });
    await PasswordResetToken.update({ usedAt: new Date() }, { where: { id: record.id }, transaction });
    await tokenService.revokeAllForUser(user.id, { transaction });
  });

  logger.info({ userId: user.id }, 'password reset completed');
  return { message: 'Password updated. Please sign in again.' };
}

module.exports = { requestReset, resetPassword };