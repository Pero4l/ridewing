'use strict';

/**
 * Email verification.
 *
 * Raw tokens are random 32-byte values, hashed with SHA-256 before they touch
 * the database. The hash is in the database; the plaintext travels only in the
 * verification link. A rider may request a new token before the old one expires:
 * requesting replaces the outstanding token, so links go stale in a bounded way.
 */

const crypto = require('crypto');

const env = require('../config/env');
const { User, EmailVerificationToken } = require('../models');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const emailService = require('./email.service');

const RESEND_COOLDOWN_MS = 60 * 1000;

function hash(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function generateRawToken() {
  return crypto.randomBytes(32).toString('base64url');
}

const isEnabled = () => emailService.enabled() && env.email.verificationTokenTtlMinutes > 0;

/** True when the user's workflow never needs a verification email (no email on file). */
const hasVerifiableEmail = (user) => Boolean(user.email);

async function getRequirement(userId) {
  const user = await User.findByPk(userId);
  if (!user) throw ApiError.notFound('Account not found');
  return {
    email: user.email ?? null,
    verified: Boolean(user.emailVerifiedAt),
    canVerify: isEnabled() && hasVerifiableEmail(user),
  };
}

/**
 * Mints a token and sends the verification email. Replaces any outstanding
 * token so an old link cannot be replayed after a resend.
 */
async function createAndSend(userId) {
  const user = await User.findByPk(userId);
  if (!user) throw ApiError.notFound('Account not found');

  if (!isEnabled()) {
    throw ApiError.serviceUnavailable('Email verification is not configured on this server');
  }
  if (!hasVerifiableEmail(user)) {
    throw ApiError.badRequest('No email address on this account to verify');
  }
  if (user.emailVerifiedAt) {
    return { alreadyVerified: true };
  }

  const outstanding = await EmailVerificationToken.findOne({
    where: { userId, usedAt: null },
    order: [['createdAt', 'DESC']],
  });
  if (outstanding && Date.now() - outstanding.createdAt.getTime() < RESEND_COOLDOWN_MS) {
    const waitSeconds = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - outstanding.createdAt.getTime())) / 1000);
    throw ApiError.conflict(`A verification email was just sent. Try again in ${waitSeconds} seconds.`);
  }

  const rawToken = generateRawToken();
  const expiresAt = new Date(Date.now() + env.email.verificationTokenTtlMinutes * 60 * 1000);

  await EmailVerificationToken.update(
    { usedAt: new Date(), expiresAt: new Date(0) },
    { where: { userId, usedAt: null } },
  );
  await EmailVerificationToken.create({
    userId,
    tokenHash: hash(rawToken),
    expiresAt,
  });

  const verifyUrl = new URL('/verify-email', env.frontendUrl);
  verifyUrl.searchParams.set('token', rawToken);
  const ttlMinutes = env.email.verificationTokenTtlMinutes;

  try {
    await emailService.sendTransactional({
      to: user.email,
      subject: 'Confirm your RideWing email',
      text:
        `Hi ${user.displayName},\n\n` +
        `We received a request to create a RideWing account using this email address. ` +
        `Confirm it by opening this link (valid for ${ttlMinutes} minutes):\n\n${verifyUrl.toString()}\n\n` +
        `If you did not create a RideWing account, you can ignore this email.\n`,
      html: emailService.renderHtml({
        title: 'Confirm your email address',
        preview: `Hi ${user.displayName},`,
        paragraphs: [
          'We received a request to create a RideWing account using this email address. Confirm it by tapping the button below.',
          `This link stays valid for ${ttlMinutes} minutes. If you did not create a RideWing account, you can ignore this email.`,
        ],
        button: { href: verifyUrl.toString(), label: 'Verify email address' },
      }),
    });
  } catch (error) {
    await EmailVerificationToken.destroy({ where: { userId } });
    throw error;
  }

  return { sent: true };
}

/**
 * Redeems a raw token against the current user. If the email belongs to a
 * different account it is still accepted — the login is the authorization —
 * so an account can adopt the address it signed up with.
 */
async function verify(userId, rawToken) {
  const user = await User.findByPk(userId);
  if (!user) throw ApiError.notFound('Account not found');

  const token = await EmailVerificationToken.findOne({ where: { tokenHash: hash(rawToken) } });
  if (!token?.isUsable()) {
    throw ApiError.badRequest('This verification link is invalid or has expired');
  }
  if (token.userId !== user.id) {
    throw ApiError.badRequest('This verification link does not match your account');
  }

  await token.update({ usedAt: new Date() });
  await user.update({ emailVerifiedAt: new Date() });

  logger.info({ userId: user.id }, 'email verified');
  return { verified: true, emailVerifiedAt: user.emailVerifiedAt };
}

module.exports = { isEnabled, hasVerifiableEmail, getRequirement, createAndSend, verify };