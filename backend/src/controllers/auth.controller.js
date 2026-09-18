'use strict';

/**
 * Auth endpoints.
 *
 * The refresh token is delivered only as an httpOnly cookie, so client JavaScript
 * — and therefore any XSS payload — cannot read it. The short-lived access token is
 * returned in the body for the client to hold in memory.
 */

const env = require('../config/env');
const asyncHandler = require('../utils/asyncHandler');
const authService = require('../services/auth.service');
const passwordResetService = require('../services/passwordReset.service');

const REFRESH_COOKIE = 'rw_refresh';
const REFRESH_PATH = '/api/auth';

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.cookies.secure,
    sameSite: env.cookies.sameSite,
    // Third-party context (frontend on a different site than this API): with
    // SameSite=None the cookie must be CHIPS-partitioned to survive the
    // third-party cookie phase-out. Partitioned keeps it scoped to the top-level
    // site that created it, which is exactly the app->api pair.
    partitioned: true,
    domain: env.cookies.domain,
    // Scoped to the auth routes: the cookie is not attached to every API call.
    path: REFRESH_PATH,
    maxAge: env.auth.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
  };
}

function setRefreshCookie(res, rawToken) {
  res.cookie(REFRESH_COOKIE, rawToken, refreshCookieOptions());
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
}

const register = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.register(req.body, {
    userAgent: req.headers['user-agent'],
  });

  setRefreshCookie(res, refreshToken);
  res.status(201).json({ user: user.toPrivateJSON(), accessToken });
});

const registerAdmin = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.registerAdmin(req.body, {
    adminToken: req.header('X-Admin-Token'),
    userAgent: req.headers['user-agent'],
  });

  setRefreshCookie(res, refreshToken);
  res.status(201).json({ user: user.toPrivateJSON(), accessToken });
});

const login = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.login(req.body, {
    userAgent: req.headers['user-agent'],
  });

  setRefreshCookie(res, refreshToken);
  res.json({ user: user.toPrivateJSON(), accessToken });
});

const refresh = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.refresh(
    req.cookies?.[REFRESH_COOKIE],
    { userAgent: req.headers['user-agent'] },
  );

  setRefreshCookie(res, refreshToken);
  res.json({ user: user.toPrivateJSON(), accessToken });
});

const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.cookies?.[REFRESH_COOKIE]);
  clearRefreshCookie(res);
  res.status(204).end();
});

const me = asyncHandler(async (req, res) => {
  res.json({ user: req.user.toPrivateJSON() });
});

/** Changing a password revokes every session, including this one. */
const changePassword = asyncHandler(async (req, res) => {
  await authService.changePassword(req.user.id, req.body);
  clearRefreshCookie(res);
  res.json({ message: 'Password updated. Please sign in again.' });
});

const forgotPassword = asyncHandler(async (req, res) => {
  res.json(await passwordResetService.requestReset(req.body));
});

const resetPassword = asyncHandler(async (req, res) => {
  res.json(await passwordResetService.resetPassword(req.body));
});

module.exports = { register, registerAdmin, login, refresh, logout, me, changePassword, forgotPassword, resetPassword, REFRESH_COOKIE };
