'use strict';

const { z } = require('zod');
const { uuid } = require('./common.validator');

const create = z
  .object({
    subject: z.string().trim().min(3, 'Subject must be at least 3 characters').max(120),
    body: z.string().trim().min(1, 'Please describe the issue').max(5000),
  })
  .strict();

const ticketParam = z.object({ ticketId: uuid }).strict();

/** Admin queue filter, e.g. `?status=open`. */
const listQuery = z
  .object({ status: z.enum(['open', 'resolved']).optional() })
  .strict();

const resolve = z
  .object({ note: z.string().trim().max(1000).optional() })
  .strict();

module.exports = { create, ticketParam, listQuery, resolve };