'use strict';

const { z } = require('zod');
const {
  username,
  email,
  phone,
  password,
  displayName,
  bikeInfo,
} = require('./common.validator');

/** Registration requires a username, a password, and at least one contact method. */
const register = z
  .object({
    username,
    email: email.optional(),
    phone: phone.optional(),
    password,
    displayName: displayName.optional(),
    bio: z.string().trim().max(500).optional(),
    bikeInfo: bikeInfo.optional(),
  })
  .strict()
  .refine((value) => Boolean(value.email || value.phone), {
    message: 'Provide an email address or a phone number',
    path: ['email'],
  });

/** One field for username, email or phone — the server works out which it is. */
/** Admin-only signup. Guarded by the ADMIN_REGISTER_TOKEN header, not the
 * ordinary open /register path, so admin accounts can never be claimed by an
 * anonymous visitor even if the public form is abused. Email is required —
 * admins must exist in Brevo's contact grid to receive the daily/event admin mail. */
const adminRegister = z
  .object({
    username,
    email,
    password,
    displayName: displayName.optional(),
  })
  .strict();

const login = z
  .object({
    identifier: z.string().trim().min(3, 'Enter your username, email or phone').max(255),
    password: z.string().min(1, 'Password is required').max(200),
  })
  .strict();

const changePassword = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required').max(200),
    newPassword: password,
  })
  .strict();

const verifyEmail = z
  .object({
    token: z.string().trim().min(20, 'Verification token is required').max(200),
  })
  .strict();

/** Forgot-password runs before sign-in; only the contact email is accepted. */
const forgotPassword = z
  .object({
    email,
  })
  .strict();

const resetPassword = z
  .object({
    token: z.string().trim().min(20, 'Reset token is required').max(200),
    password,
  })
  .strict();

module.exports = { register, adminRegister, login, changePassword, verifyEmail, forgotPassword, resetPassword };
