'use strict';

/**
 * Refresh-token device binding.
 *
 * Theft detection used to compare only `user_agent`, and treated a *missing*
 * agent on either side as "same browser". Any non-browser client sends no
 * User-Agent, so a stolen cookie replayed from one of those was accepted as
 * legitimate and minted a fresh, valid access + refresh pair for the victim.
 *
 * Rotation is now bound to `X-Device-Id`, and the comparison fails closed when
 * the binding is missing on either side.
 */

const { sequelize, RefreshToken, User } = require('../src/models');
const tokenService = require('../src/services/token.service');
const authService = require('../src/services/auth.service');

const DEVICE_A = 'device-aaaa1111';
const DEVICE_B = 'device-bbbb2222';

const userId = '33333333-3333-4333-8333-333333333333';

describe('normalizeDeviceId', () => {
  it('accepts a well-formed opaque id', () => {
    expect(tokenService.normalizeDeviceId(DEVICE_A)).toBe(DEVICE_A);
  });

  it('rejects an id that is too short to be unguessable', () => {
    expect(tokenService.normalizeDeviceId('abc')).toBeNull();
  });

  it('rejects characters outside the allowed set', () => {
    expect(tokenService.normalizeDeviceId("'; DROP TABLE users;--")).toBeNull();
    expect(tokenService.normalizeDeviceId('has space')).toBeNull();
  });

  it('rejects empty and missing values rather than defaulting them', () => {
    expect(tokenService.normalizeDeviceId('')).toBeNull();
    expect(tokenService.normalizeDeviceId(undefined)).toBeNull();
    expect(tokenService.normalizeDeviceId(null)).toBeNull();
  });
});

describe('refresh token rotation', () => {
  let user;

  beforeAll(async () => {
    user = await User.create({
      username: `rotdev${Math.random().toString(36).slice(2, 9)}`,
      displayName: 'Rotation Dev',
      email: `${Math.random().toString(36).slice(2, 10)}@example.test`,
      // A real hash, because the column/model expects one and the login path is
      // never exercised here.
      passwordHash: await authService.hashPassword('correct-horse-battery'),
    });
    // bcrypt at the configured cost takes longer than Jest's 5s default hook.
  }, 30000);

  afterAll(async () => {
    if (user) {
      await RefreshToken.destroy({ where: { userId: user.id } });
      await user.destroy();
    }
    await sequelize.close();
  });

  beforeEach(async () => {
    await RefreshToken.destroy({ where: { userId: user.id } });
  });

  it('issues a token bound to the device that asked for it', async () => {
    const { record } = await tokenService.issueRefreshToken(user.id, {
      deviceId: DEVICE_A,
      userAgent: 'jest',
    });

    expect(record.deviceId).toBe(DEVICE_A);
  });

  it('rotates normally for the same device', async () => {
    const { rawToken } = await tokenService.issueRefreshToken(user.id, {
      deviceId: DEVICE_A,
    });

    const result = await tokenService.rotateRefreshToken(rawToken, { deviceId: DEVICE_A });

    expect(result.userId).toBe(user.id);
    expect(result.rawToken).toBeTruthy();
    expect(result.rawToken).not.toBe(rawToken);
  });

  it('carries the device binding onto the replacement token', async () => {
    const { rawToken } = await tokenService.issueRefreshToken(user.id, {
      deviceId: DEVICE_A,
    });
    const { rawToken: next } = await tokenService.rotateRefreshToken(rawToken, {
      deviceId: DEVICE_A,
    });

    const replacement = await RefreshToken.findOne({
      where: { userId: user.id },
      order: sequelize.literal('created_at DESC'),
    });
    expect(replacement.deviceId).toBe(DEVICE_A);
    expect(next).toBeTruthy();
  });

  // The regression: a replayed cookie from a different device must not be able to
  // walk the replacement chain forward and mint a working session.
  it('refuses a replay from a different device and revokes the family', async () => {
    const { rawToken } = await tokenService.issueRefreshToken(user.id, {
      deviceId: DEVICE_A,
    });
    await tokenService.rotateRefreshToken(rawToken, { deviceId: DEVICE_A });

    await expect(
      tokenService.rotateRefreshToken(rawToken, { deviceId: DEVICE_B }),
    ).rejects.toThrow(/revoked/i);

    const live = await RefreshToken.count({
      where: { userId: user.id, revokedAt: null },
    });
    expect(live).toBe(0);
  });

  it('refuses a replay that presents no device at all (fails closed)', async () => {
    const { rawToken } = await tokenService.issueRefreshToken(user.id, {
      deviceId: DEVICE_A,
    });
    await tokenService.rotateRefreshToken(rawToken, { deviceId: DEVICE_A });

    // No User-Agent and no X-Device-Id is exactly what `curl` sends. This used
    // to be treated as "same browser" and succeeded.
    await expect(tokenService.rotateRefreshToken(rawToken, {})).rejects.toThrow(
      /revoked/i,
    );
  });

  it('refuses a replay of a token issued before device binding existed', async () => {
    const { rawToken } = await tokenService.issueRefreshToken(user.id, {
      deviceId: DEVICE_A,
    });
    await tokenService.rotateRefreshToken(rawToken, { deviceId: DEVICE_A });

    // Simulate both tokens predating the device-binding column: unbound. A
    // *live* token is valid for whoever holds it — that is what a refresh token
    // is — so the guard applies to reuse, and an unbound one must fail closed.
    await RefreshToken.update({ deviceId: null }, { where: { userId: user.id } });

    await expect(
      tokenService.rotateRefreshToken(rawToken, { deviceId: DEVICE_A }),
    ).rejects.toThrow(/revoked/i);
  });

  it('binds a previously-unbound live token to the device that first rotates it', async () => {
    // The real legacy case: a token minted before the device column existed. It
    // is still *live*, and a live token is valid for whoever holds it — that is
    // what a refresh token is. Rotating it should adopt the presenting device, so
    // any later reuse from another device is caught.
    const { rawToken } = await tokenService.issueRefreshToken(user.id, {
      deviceId: DEVICE_A,
    });
    await RefreshToken.update({ deviceId: null }, { where: { userId: user.id } });

    const { rawToken: next } = await tokenService.rotateRefreshToken(rawToken, {
      deviceId: DEVICE_A,
    });
    expect(next).toBeTruthy();

    const adopted = await RefreshToken.findOne({
      where: { userId: user.id, revokedAt: null },
    });
    expect(adopted.deviceId).toBe(DEVICE_A);
  });

  it('still lets the real owner rotate after a device-binding mix-up is rejected', async () => {
    const { rawToken } = await tokenService.issueRefreshToken(user.id, {
      deviceId: DEVICE_A,
    });
    // A legitimate second tab presenting the same cookie mid-rotation, with the
    // correct device, must be able to follow the chain forward.
    await tokenService.rotateRefreshToken(rawToken, { deviceId: DEVICE_A });

    const result = await tokenService.rotateRefreshToken(rawToken, { deviceId: DEVICE_A });

    expect(result.userId).toBe(user.id);
  });
});