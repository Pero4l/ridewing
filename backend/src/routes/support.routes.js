'use strict';

const express = require('express');

const validate = require('../middleware/validate');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimit');
const supportController = require('../controllers/support.controller');
const v = require('../validators/support.validator');

const router = express.Router();

router.use(requireAuth);

// Rider side: create and list your own tickets.
router.get('/', supportController.listMine);
router.post('/', writeLimiter, validate({ body: v.create }), supportController.create);

// Admin side: the working queue and resolution.
router.get('/admin', requireAdmin, validate({ query: v.listQuery }), supportController.listAll);
router.put(
  '/admin/:ticketId/resolve',
  requireAdmin,
  writeLimiter,
  validate({ params: v.ticketParam, body: v.resolve }),
  supportController.resolve,
);

// Owner or admin may read a single ticket.
router.get('/:ticketId', validate({ params: v.ticketParam }), supportController.get);

module.exports = router;