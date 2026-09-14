'use strict';

const { z } = require('zod');
const { username, slug, uuid, pagination } = require('./common.validator');

const slugParam = z.object({ slug }).strict();

const create = z
  .object({
    name: z.string().trim().min(3, 'Community name must be at least 3 characters').max(80),
    bio: z.string().trim().max(1000).optional(),
    image: z.string().trim().url('Image must be a valid URL').max(500).optional(),
    joinPolicy: z.enum(['open', 'request']).optional(),
  })
  .strict();

const update = z
  .object({
    name: z.string().trim().min(3).max(80).optional(),
    bio: z.string().trim().max(1000).nullable().optional(),
    image: z.string().trim().url().max(500).nullable().optional(),
    joinPolicy: z.enum(['open', 'request']).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'No changes supplied' });

const join = z.object({ message: z.string().trim().max(300).optional() }).strict();

const reviewRequest = z
  .object({ decision: z.enum(['approved', 'rejected']) })
  .strict();

const requestParams = z.object({ slug, requestId: uuid }).strict();

/**
 * Role changes never include `owner` — ownership moves only through the dedicated
 * transfer endpoint, which has its own checks.
 */
const setRole = z.object({ role: z.enum(['admin', 'moderator', 'member']) }).strict();

const memberParams = z.object({ slug, username }).strict();

const removeMemberQuery = z
  .object({ ban: z.enum(['true', 'false']).optional() })
  .strict();

const listQuery = pagination.merge(z.object({ search: z.string().trim().max(60).optional() })).strict();

const requestsQuery = z
  .object({ status: z.enum(['pending', 'approved', 'rejected', 'cancelled']).optional() })
  .strict();

module.exports = {
  slugParam,
  create,
  update,
  join,
  reviewRequest,
  requestParams,
  setRole,
  memberParams,
  removeMemberQuery,
  listQuery,
  requestsQuery,
};
