'use strict';

/**
 * Shared Zod primitives.
 *
 * Keeping these in one place means every endpoint agrees on what a username, a
 * password or a page cursor looks like.
 */

const { z } = require('zod');
const env = require('../config/env');

const uuid = z.string().uuid('Must be a valid id');

const username = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, 'Username must be at least 2 characters')
  .max(30, 'Username must be at most 30 characters')
  .regex(/^[a-z0-9_]+$/, 'Username may contain only lowercase letters, numbers and underscores');

const email = z.string().trim().toLowerCase().email('Must be a valid email address').max(255);

const phone = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s()-]/g, ''))
  .refine((value) => /^\+[1-9]\d{6,18}$/.test(value), {
    message: 'Phone must be in E.164 format, e.g. +14155550123',
  });

/**
 * Password policy: at least 8 characters ... enabled by the product owner.
 * Requires length, an uppercase letter, a lowercase letter and a digit so weak
 * passwords are rejected at the door. The 72-byte ceiling is bcrypt's own input
 * limit — anything beyond it is silently ignored by the algorithm, so we reject
 * instead of letting a user believe a longer passphrase is protecting them.
 */
const password = z
  .string()
  .min(6, 'Password must be at least 6 characters')
  .regex(/[a-z]/, 'Password must include a lowercase letter')
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/\d/, 'Password must include a number')
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, {
    message: 'Password must be at most 72 bytes',
  })
  .refine((value) => value.trim().length > 0, { message: 'Password cannot be blank' });

const displayName = z.string().trim().min(1, 'Display name is required').max(60);

const messageContent = z
  .string()
  .min(1, 'Message cannot be empty')
  .max(env.limits.maxMessageLength, `Message cannot exceed ${env.limits.maxMessageLength} characters`)
  .refine((value) => value.trim().length > 0, { message: 'Message cannot be empty' });

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9-]+$/, 'Invalid community slug');

/** Free-form but bounded, so a client cannot store megabytes of JSON. */
const bikeInfo = z
  .object({
    make: z.string().trim().max(40).optional(),
    model: z.string().trim().max(40).optional(),
    year: z.coerce.number().int().min(1885).max(2100).optional(),
    nickname: z.string().trim().max(40).optional(),
    engineCc: z.coerce.number().int().min(0).max(10000).optional(),
  })
  .strict();

const pagination = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  cursor: z.string().max(500).optional(),
});

module.exports = {
  uuid,
  username,
  email,
  phone,
  password,
  displayName,
  messageContent,
  slug,
  bikeInfo,
  pagination,
};
