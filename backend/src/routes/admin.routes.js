'use strict';

/**
 * Admin APIs for account management.
 *
 * Registration of the FIRST admin is not here: it is the token-gated
 * `POST /api/auth/admin/register`, which works with no admin account in
 * existence. Everything below requires an authenticated admin.
 *
 * Route order matters — `/:userId` is registered last so it can never swallow
 * a literal segment like `/stats`.
 */

const express = require('express');

const validate = require('../middleware/validate');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimit');
const adminController = require('../controllers/admin.controller');
const v = require('../validators/admin.validator');

const router = express.Router();

router.use(requireAuth, requireAdmin);

router.get('/stats', adminController.getStats);
router.get('/activity', validate({ query: v.listActivityQuery }), adminController.listActivity);
router.get('/users', validate({ query: v.listUsersQuery }), adminController.listUsers);

router.patch('/users/:userId/role', writeLimiter, validate({ params: v.userParam, body: v.changeRoleBody }), adminController.changeRole);

router.post(
  '/users/:userId/suspend',
  writeLimiter,
  validate({ params: v.userParam, body: v.suspendBody }),
  adminController.suspendUser,
);

router.post('/users/:userId/unsuspend', writeLimiter, validate({ params: v.userParam }), adminController.unsuspendUser);

router.post('/users/:userId/revoke-sessions', writeLimiter, validate({ params: v.userParam }), adminController.revokeSessions);

router.get('/users/:userId', validate({ params: v.userParam }), adminController.getUser);

module.exports = router;
