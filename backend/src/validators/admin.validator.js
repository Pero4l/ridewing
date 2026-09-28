'use strict';

const { z } = require('zod');
const { uuid } = require('./common.validator');

/** Filters for the admin user directory. */
const listUsersQuery = z
  .object({
    status: z.enum(['active', 'suspended']).optional(),
    role: z.enum(['rider', 'admin']).optional(),
    q: z.string().trim().min(1, 'Search term cannot be empty').max(60).optional(),
    page: z.coerce.number().int().positive().max(10000).default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  })
  .strict();

const userParam = z.object({ userId: uuid }).strict();

const changeRoleBody = z.object({ role: z.enum(['rider', 'admin']) }).strict();

const suspendBody = z
  .object({ reason: z.string().trim().max(500, 'Reason must be at most 500 characters').optional() })
  .strict();

const listActivityQuery = z
  .object({
    page: z.coerce.number().int().positive().max(10000).default(1),
    limit: z.coerce.number().int().positive().max(100).default(50),
  })
  .strict();

module.exports = { listUsersQuery, userParam, changeRoleBody, suspendBody, listActivityQuery };
