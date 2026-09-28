'use strict';

const asyncHandler = require('../utils/asyncHandler');
const adminService = require('../services/admin.service');

const listUsers = asyncHandler(async (req, res) => {
  const result = await adminService.listUsers(req.validatedQuery);
  res.json(result);
});

const getUser = asyncHandler(async (req, res) => {
  const user = await adminService.getUser(req.params.userId);
  res.json({ user: user.toPrivateJSON() });
});

const getStats = asyncHandler(async (req, res) => {
  const stats = await adminService.getStats();
  res.json(stats);
});

/** Every mutation passes req.user (not just its id) so the service can stamp the
 * activity log with the acting admin's username as well as their id. */
const changeRole = asyncHandler(async (req, res) => {
  const user = await adminService.changeRole(req.user, req.params.userId, req.body);
  res.json({ user });
});

const suspendUser = asyncHandler(async (req, res) => {
  const user = await adminService.suspendUser(req.user, req.params.userId, req.body);
  res.json({ user });
});

const unsuspendUser = asyncHandler(async (req, res) => {
  const user = await adminService.unsuspendUser(req.user, req.params.userId);
  res.json({ user });
});

const revokeSessions = asyncHandler(async (req, res) => {
  const result = await adminService.revokeSessions(req.user, req.params.userId);
  res.json(result);
});

const listActivity = asyncHandler(async (req, res) => {
  const result = await adminService.listActivity(req.validatedQuery);
  res.json(result);
});

module.exports = {
  listUsers,
  getUser,
  getStats,
  listActivity,
  changeRole,
  suspendUser,
  unsuspendUser,
  revokeSessions,
};
