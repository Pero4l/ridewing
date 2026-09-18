'use strict';

const { z } = require('zod');
const { username, displayName, bikeInfo, pagination } = require('./common.validator');

const usernameParam = z.object({ username }).strict();

/**
 * Profile updates. `.strict()` matters here: it stops a client from sending
 * `passwordHash` or `id` and having it reach a model update.
 */
const updateProfile = z
  .object({
    displayName: displayName.optional(),
    bio: z.string().trim().max(500).nullable().optional(),
    profileImage: z.string().trim().url('Profile image must be a valid URL').max(500).nullable().optional(),
    bikeInfo: bikeInfo.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'No changes supplied' });

const searchQuery = z
  .object({ q: z.string().trim().min(2, 'Enter at least 2 characters').max(60) })
  .merge(pagination.partial())
  .strict();

// The gallery tabs are client-driven; the server accepts the value so it does
// not 400 on a tab switch, then `userPosts` falls back to 'posts' for tabs it
// does not implement.
const listQuery = z
  .object({ tab: z.enum(['posts', 'tagged', 'shared']).optional() })
  .merge(pagination.strict())
  .strict();

module.exports = { usernameParam, updateProfile, searchQuery, listQuery };
