'use strict';

const { z } = require('zod');
const { pagination } = require('./common.validator');

const mediaItem = z
  .object({
    url: z.string().min(1).max(1000),
    type: z.enum(['image', 'video']),
    width: z.number().int().positive().max(10000).optional(),
    height: z.number().int().positive().max(10000).optional(),
  })
  .strict();

const create = z
  .object({
    content: z.string().trim().max(2000).optional(),
    media: z.array(mediaItem).max(9).optional(),
  })
  .strict()
  .refine((value) => value.content || (value.media && value.media.length > 0), {
    message: 'Write something or add a photo',
  });

const edit = create;

const comment = z
  .object({
    content: z.string().trim().min(1, 'Comment cannot be empty').max(1000),
  })
  .strict();

const feedParams = pagination;
const idParams = z.object({ id: z.string().uuid('Must be a valid post id') }).strict();

module.exports = { create, edit, comment, feedParams, idParams };