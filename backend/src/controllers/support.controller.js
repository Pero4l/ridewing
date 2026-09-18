'use strict';

const asyncHandler = require('../utils/asyncHandler');
const supportService = require('../services/support.service');

const create = asyncHandler(async (req, res) => {
  const ticket = await supportService.create(req.user.id, req.body);
  res.status(201).json({ ticket: ticket.toJSONSafe() });
});

const listMine = asyncHandler(async (req, res) => {
  const tickets = await supportService.listMine(req.user.id);
  res.json({ tickets: tickets.map((ticket) => ticket.toJSONSafe()) });
});

/** Admin-only queue. */
const listAll = asyncHandler(async (req, res) => {
  const tickets = await supportService.listAll(req.validatedQuery);
  res.json({ tickets: tickets.map((ticket) => ticket.toJSONSafe()) });
});

/** Admin-only resolution. */
const resolve = asyncHandler(async (req, res) => {
  const ticket = await supportService.resolve(req.params.ticketId, req.user.id, req.body);
  res.json({ ticket: ticket.toJSONSafe() });
});

const get = asyncHandler(async (req, res) => {
  const ticket = await supportService.get(
    req.params.ticketId,
    req.user.id,
    req.user.role === 'admin',
  );
  res.json({ ticket: ticket.toJSONSafe() });
});

module.exports = { create, listMine, listAll, resolve, get };