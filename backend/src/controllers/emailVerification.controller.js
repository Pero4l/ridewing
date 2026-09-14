'use strict';

const asyncHandler = require('../utils/asyncHandler');
const emailVerificationService = require('../services/emailVerification.service');

const sendVerification = asyncHandler(async (req, res) => {
  const result = await emailVerificationService.createAndSend(req.user.id);
  if (result.alreadyVerified) {
    return res.json({ verified: true });
  }
  res.json({ sent: true });
});

/** Public requirement, so the client knows whether to show the verification UI. */
const verificationStatus = asyncHandler(async (req, res) => {
  const status = await emailVerificationService.getRequirement(req.user.id);
  res.json(status);
});

const verifyEmail = asyncHandler(async (req, res) => {
  const user = await emailVerificationService.verify(req.user.id, req.body.token);
  res.json(user);
});

module.exports = { sendVerification, verificationStatus, verifyEmail };