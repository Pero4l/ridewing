'use strict';

/**
 * Email verification with OTP (One-Time Password).
 *
 * A 6-digit OTP code is generated, hashed with SHA-256, and stored in the database.
 * The plaintext OTP is sent via email. The user enters the OTP in the app to verify.
 */

const crypto = require('crypto');

const env = require('../config/env');
const { User, EmailVerificationToken } = require('../models');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const emailService = require('./email.service');

const RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_LENGTH = 6;
const OTP_TTL_MINUTES = 10;

function hash(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
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
 * Generates an OTP and sends it via email. Replaces any outstanding
 * OTP so an old code cannot be replayed after a resend.
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

  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  await EmailVerificationToken.update(
    { usedAt: new Date(), expiresAt: new Date(0) },
    { where: { userId, usedAt: null } },
  );
  await EmailVerificationToken.create({
    userId,
    tokenHash: hash(otp),
    expiresAt,
  });

  try {
    await emailService.sendTransactional({
      to: user.email,
      subject: 'Your RideWing verification code',
      text:
        `Hi ${user.displayName},\n\n` +
        `Your verification code is: ${otp}\n\n` +
        `This code expires in ${OTP_TTL_MINUTES} minutes. ` +
        `If you did not create a RideWing account, you can ignore this email.\n`,
      html: emailService.renderHtml({
        title: 'Your verification code',
        preview: `Hi ${user.displayName},`,
        paragraphs: [
          'Enter the following 6-digit code in the RideWing app to verify your email address:',
          `<div style="font-size: 32px; font-weight: 700; letter-spacing: 8px; text-align: center; margin: 24px 0; font-family: monospace;">${otp}</div>`,
          `This code expires in ${OTP_TTL_MINUTES} minutes. If you did not create a RideWing account, you can ignore this email.`,
        ],
      }),
    });
  } catch (error) {
    await EmailVerificationToken.destroy({ where: { userId } });
    throw error;
  }

  return { sent: true };
}

/**
 * Verifies an OTP code against the current user.
 */
async function verify(userId, otp) {
  const user = await User.findByPk(userId);
  if (!user) throw ApiError.notFound('Account not found');

  const token = await EmailVerificationToken.findOne({ where: { tokenHash: hash(otp) } });
  if (!token?.isUsable()) {
    throw ApiError.badRequest('This verification code is invalid or has expired');
  }
  if (token.userId !== user.id) {
    throw ApiError.badRequest('This verification code does not match your account');
  }

  await token.update({ usedAt: new Date() });
  await user.update({ emailVerifiedAt: new Date() });

  logger.info({ userId: user.id }, 'email verified');
  return { verified: true, emailVerifiedAt: user.emailVerifiedAt };
}

module.exports = { isEnabled, hasVerifiableEmail, getRequirement, createAndSend, verify };