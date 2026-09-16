'use strict';

const express = require('express');

const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { loginLimiter, registerLimiter, refreshLimiter, passwordResetLimiter, writeLimiter } = require('../middleware/rateLimit');
const authController = require('../controllers/auth.controller');
const emailVerificationController = require('../controllers/emailVerification.controller');
const authValidator = require('../validators/auth.validator');

const router = express.Router();

router.post(
  '/register',
  registerLimiter,
  validate({ body: authValidator.register }),
  authController.register,
);

router.post('/login', loginLimiter, validate({ body: authValidator.login }), authController.login);

// Authenticated by the refresh cookie itself, not a bearer token.
router.post('/refresh', refreshLimiter, authController.refresh);

router.post('/logout', authController.logout);

router.get('/me', requireAuth, authController.me);

router.post(
  '/change-password',
  requireAuth,
  writeLimiter,
  validate({ body: authValidator.changePassword }),
  authController.changePassword,
);

router.get('/email-verification', requireAuth, emailVerificationController.verificationStatus);

router.post(
  '/send-verification',
  requireAuth,
  writeLimiter,
  emailVerificationController.sendVerification,
);

router.post(
  '/verify-email',
  requireAuth,
  writeLimiter,
  validate({ body: authValidator.verifyEmail }),
  emailVerificationController.verifyEmail,
);

// Pre-sign-in routes — no bearer token.
router.post(
  '/forgot-password',
  passwordResetLimiter,
  validate({ body: authValidator.forgotPassword }),
  authController.forgotPassword,
);

router.post(
  '/reset-password',
  passwordResetLimiter,
  validate({ body: authValidator.resetPassword }),
  authController.resetPassword,
);

module.exports = router;
