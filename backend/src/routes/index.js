'use strict';

/** API route table. */

const express = require('express');

const { sequelize } = require('../models');
const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const communityRoutes = require('./community.routes');
const conversationRoutes = require('./conversation.routes');
const messageRoutes = require('./message.routes');
const rideRoutes = require('./ride.routes');
const notificationRoutes = require('./notification.routes');
const uploadRoutes = require('./upload.routes');
const postRoutes = require('./post.routes');
const pushRoutes = require('./push.routes');
const supportRoutes = require('./support.routes');

const router = express.Router();

/**
 * Liveness/readiness probe. Reports database reachability but deliberately reveals
 * nothing about the connection itself.
 */
router.get('/health', async (req, res) => {
  try {
    await sequelize.authenticate();
    res.json({ status: 'ok', database: 'up', uptime: Math.floor(process.uptime()) });
  } catch {
    res.status(503).json({ status: 'degraded', database: 'down' });
  }
});

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/communities', communityRoutes);
router.use('/conversations', conversationRoutes);
router.use('/messages', messageRoutes);
router.use('/rides', rideRoutes);
router.use('/notifications', notificationRoutes);
router.use('/upload', uploadRoutes);
router.use('/posts', postRoutes);
router.use('/push', pushRoutes);
router.use('/support', supportRoutes);

module.exports = router;
