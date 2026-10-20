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
    const otpHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <!-- Header -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #059669 0%, #047857 100%); border-radius: 16px 16px 0 0; padding: 24px 20px;">
          <tr>
            <td align="center" style="color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">
              RideWing
            </td>
          </tr>
        </table>
        
        <!-- Main Content -->
        <div style="background: #ffffff; border: 1px solid #e4e4e7; border-top: 0; border-radius: 0 0 16px 16px; padding: 32px 24px;">
          <h1 style="margin: 0 0 8px; font-size: 22px; color: #18181b; font-weight: 700; text-align: center;">Your verification code</h1>
          <p style="margin: 0 0 24px; color: #71717a; font-size: 14px; text-align: center;">Hi ${user.displayName},</p>
          
          <p style="margin: 0 0 16px; color: #3f3f46; font-size: 14px; text-align: center; line-height: 1.5;">Enter the following 6-digit code in the RideWing app to verify your email address:</p>
          
          <!-- OTP Code Box -->
          <div style="margin: 28px 0; text-align: center;">
            <div style="display: inline-block; background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border: 2px solid #86efac; border-radius: 16px; padding: 20px 32px; box-shadow: 0 4px 14px rgba(5, 150, 105, 0.15);">
              <div style="font-size: 40px; font-weight: 800; letter-spacing: 12px; color: #059669; font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Mono', monospace; text-shadow: 0 2px 4px rgba(5, 150, 105, 0.1);">
                ${otp}
              </div>
            </div>
          </div>
          
          <p style="margin: 24px 0 0; color: #71717a; font-size: 13px; text-align: center; line-height: 1.5;">
            This code expires in <strong>${OTP_TTL_MINUTES} minutes</strong>. If you did not create a RideWing account, you can safely ignore this email.
          </p>
        </div>
        
        <!-- Footer -->
        <p style="font-size: 12px; color: #a1a1aa; margin: 20px 0 0; text-align: center;">
          RideWing &middot; Ride with riders you trust
        </p>
      </div>
    `;

    await emailService.sendTransactional({
      to: user.email,
      subject: 'Your RideWing verification code',
      text:
        `Hi ${user.displayName},\n\n` +
        `Your verification code is: ${otp}\n\n` +
        `This code expires in ${OTP_TTL_MINUTES} minutes. ` +
        `If you did not create a RideWing account, you can ignore this email.\n`,
      html: otpHtml,
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